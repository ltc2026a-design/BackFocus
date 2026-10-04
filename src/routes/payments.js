import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ApiError, asyncHandler, notFound, assertOwnerOrAdmin } from "../utils/errors.js";
import { planShape, paymentShape, subscriptionShape } from "../utils/serialize.js";
import { detectCardBrand, isPlausibleCard, onlyDigits } from "../utils/card.js";
import { logEvent } from "../services/history.js";
import { sendPaymentReceipt } from "../services/mailer.js";

export const paymentsRouter = Router();

// Orden de superioridad de planes: solo se permite subir de nivel.
const PLAN_RANK = { free: 0, pro_mensual: 1, pro_anual: 2, lifetime: 3 };

const checkoutSchema = z.object({
  body: z.object({
    planTipo: z.enum(["free", "pro_mensual", "pro_anual", "lifetime"]),
    metodo: z.enum(["tarjeta", "paypal", "transferencia", "nequi", "llave"]),
    ciclo: z.enum(["mensual", "anual", "unico"]),
    tarjeta: z
      .object({
        numero: z.string().regex(/^\d{12,19}$/, "número de tarjeta inválido"),
        nombre: z.string().min(1).max(120),
        expiraMM: z.coerce.number().int().min(1).max(12),
        expiraAA: z.coerce.number().int().min(0).max(99),
        cvv: z.string().regex(/^\d{3,4}$/),
      })
      .optional(),
  }),
});

const patchStatusSchema = z.object({
  body: z.object({
    estado: z.enum(["pendiente", "completado", "fallido", "reembolsado"]),
  }),
});

// Regla de pago simulado del contrato (con validación real de formato):
//  - la tarjeta debe pasar Luhn y tener longitud coherente con su marca
//  - tarjeta que empieza por 4 → completado
//  - tarjeta que empieza por 5 → fallido
//  - paypal/transferencia/nequi/llave (sin tarjeta) → pendiente
function simularEstadoPago(metodo, tarjeta) {
  if (metodo === "tarjeta") {
    if (!tarjeta) throw new ApiError(400, "VALIDATION_ERROR", "Se requiere tarjeta para método tarjeta");
    const digitos = onlyDigits(tarjeta.numero);
    if (!isPlausibleCard(digitos)) {
      throw new ApiError(400, "CARD_INVALID", "El número de tarjeta no es válido (checksum o longitud)");
    }
    if (digitos.startsWith("4")) return "completado";
    if (digitos.startsWith("5")) return "fallido";
    return "fallido";
  }
  return "pendiente"; // paypal | transferencia | nequi | llave
}

function detalleTarjetaSeguro(tarjeta) {
  if (!tarjeta) return null;
  const digitos = onlyDigits(tarjeta.numero);
  return JSON.stringify({
    ultimos4: digitos.slice(-4),
    marca: detectCardBrand(digitos),
  });
  // NUNCA se guarda la tarjeta completa.
}

async function activarSuscripcion(usuarioId, planTipo, ciclo) {
  const ahora = new Date();
  const hasta = new Date(ahora);
  if (ciclo === "mensual") hasta.setMonth(hasta.getMonth() + 1);
  else if (ciclo === "anual") hasta.setFullYear(hasta.getFullYear() + 1);
  const hastaFinal = planTipo === "lifetime" ? null : hasta;

  await prisma.suscripcion.upsert({
    where: { usuarioId },
    create: { usuarioId, planTipo, activa: true, desde: ahora, hasta: hastaFinal },
    update: { planTipo, activa: true, desde: ahora, hasta: hastaFinal },
  });
}

// GET /payments/plans (pública) → { data: Plan[] }
paymentsRouter.get(
  "/plans",
  asyncHandler(async (_req, res) => {
    const planes = await prisma.plan.findMany({
      orderBy: { precioMensual: "asc" },
    });
    res.json({ data: planes.map(planShape) });
  })
);

// GET /payments/subscription/current (protegida)
paymentsRouter.get(
  "/subscription/current",
  requireAuth,
  asyncHandler(async (req, res) => {
    const suscripcion = await prisma.suscripcion.findUnique({
      where: { usuarioId: req.user.id },
    });
    const vigente =
      suscripcion && suscripcion.activa && (!suscripcion.hasta || suscripcion.hasta.getTime() > Date.now());
    res.json({
      data: vigente ? subscriptionShape(suscripcion) : null,
    });
  })
);

// POST /payments/checkout (protegida) → 201 Payment
paymentsRouter.post(
  "/checkout",
  requireAuth,
  validate(checkoutSchema),
  asyncHandler(async (req, res) => {
    const { planTipo, metodo, ciclo, tarjeta } = req.body;

    const plan = await prisma.plan.findUnique({ where: { tipo: planTipo } });
    notFound(plan, "Plan no encontrado");

    // Regla de niveles: no se puede pagar un plan igual o inferior al que ya
    // se tiene activo (solo subir de nivel).
    if (planTipo !== "free") {
      const sus = await prisma.suscripcion.findUnique({ where: { usuarioId: req.user.id } });
      const vigente =
        sus && sus.activa && (!sus.hasta || sus.hasta.getTime() > Date.now());
      if (vigente) {
        const actualRank = PLAN_RANK[sus.planTipo] ?? 0;
        const nuevoRank = PLAN_RANK[planTipo] ?? 0;
        if (nuevoRank <= actualRank) {
          throw new ApiError(
            409,
            "PLAN_UPGRADE_ONLY",
            `Ya tienes una suscripción ${sus.planTipo.replace("_", " ")}${
              nuevoRank < actualRank ? ", más completa que la que intentas comprar" : " activa"
            }. Solo puedes mejorar a un plan superior.`,
          );
        }
      }
    }

    const monto =
      ciclo === "anual"
        ? plan.precioAnual ?? plan.precioMensual
        : plan.precioMensual;

    const estado = simularEstadoPago(metodo, tarjeta);
    const referencia = `FF-${Date.now().toString(36).toUpperCase()}-${crypto
      .randomBytes(3)
      .toString("hex")
      .toUpperCase()}`;

    const pago = await prisma.pago.create({
      data: {
        usuarioId: req.user.id,
        planTipo,
        monto,
        moneda: "USD",
        metodo,
        ciclo,
        estado,
        referencia,
        detalleTarjeta: detalleTarjetaSeguro(tarjeta),
      },
    });

    await logEvent({
      usuarioId: req.user.id,
      entidadTipo: "pago",
      entidadId: pago.id,
      accion: estado === "completado" ? "completar" : estado === "fallido" ? "fallar" : "crear",
      detalle: `Pago ${estado} de ${planTipo} (${ciclo}) por ${monto} USD vía ${metodo}, ref ${referencia}`,
    });

    await prisma.notificacion.create({
      data: {
        usuarioId: req.user.id,
        tipo: "payment",
        mensaje:
          estado === "completado"
            ? `Pago completado: plan ${planTipo} por ${monto} USD (ref ${referencia}).`
            : estado === "fallido"
              ? `Pago fallido: plan ${planTipo} por ${monto} USD (ref ${referencia}).`
              : `Pago pendiente: plan ${planTipo} por ${monto} USD vía ${metodo} (ref ${referencia}).`,
      },
    });

    // Al completarse un pago pro/lifetime, el usuario queda con plan activo.
    if (estado === "completado" && planTipo !== "free") {
      await activarSuscripcion(req.user.id, planTipo, ciclo);
    }

    // Recibo por email (real si SMTP está configurado; si no, se simula en log).
    await sendPaymentReceipt({
      user: req.user,
      planNombre: plan.nombre,
      monto,
      moneda: pago.moneda,
      metodo,
      estado,
      referencia,
    });

    res.status(201).json(paymentShape(pago));
  })
);

// GET /payments (protegida) → { data: Payment[] } historial del usuario
paymentsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const pagos = await prisma.pago.findMany({
      where: { usuarioId: req.user.id },
      orderBy: { creadoEn: "desc" },
    });
    res.json({ data: pagos.map(paymentShape) });
  })
);

// PATCH /payments/:id/status (solo ADMIN) → Payment
paymentsRouter.patch(
  "/:id/status",
  requireAuth,
  requireAdmin,
  validate(patchStatusSchema),
  asyncHandler(async (req, res) => {
    notFound(await prisma.pago.findUnique({ where: { id: req.params.id } }), "Pago no encontrado");
    const pago = await prisma.pago.update({
      where: { id: req.params.id },
      data: { estado: req.body.estado },
    });
    await logEvent({
      usuarioId: req.user.id,
      entidadTipo: "pago",
      entidadId: pago.id,
      accion: "cambiar_estado",
      detalle: `Estado de pago cambiado a ${pago.estado} por admin`,
    });
    res.json(paymentShape(pago));
  })
);

// GET /payments/:id → Payment (403 si ajeno y no ADMIN)
paymentsRouter.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const pago = notFound(
      await prisma.pago.findUnique({ where: { id: req.params.id } }),
      "Pago no encontrado"
    );
    assertOwnerOrAdmin(pago, req.user, "Pago ajeno");
    res.json(paymentShape(pago));
  })
);

export default paymentsRouter;

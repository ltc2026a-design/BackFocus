import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/errors.js";
import { dateToStr } from "../services/metrics.js";

export const metricsRouter = Router();
metricsRouter.use(requireAuth);

const querySchema = z.object({
  query: z.object({ range: z.enum(["7d", "30d"]).default("7d") }),
});

// GET /metrics?range=7d|30d
metricsRouter.get(
  "/",
  validate(querySchema),
  asyncHandler(async (req, res) => {
    const dias = req.validatedQuery.range === "30d" ? 30 : 7;
    const usuarioId =
      req.user.rol === "ADMIN" && req.query.all === "true" ? undefined : req.user.id;
    const whereUsuario = usuarioId ? { usuarioId } : {};

    const hoy = new Date();
    const desde = new Date(hoy);
    desde.setDate(desde.getDate() - (dias - 1));
    desde.setHours(0, 0, 0, 0);
    const desdeStr = dateToStr(desde);

    const metricas = await prisma.metricaDiaria.findMany({
      where: { ...whereUsuario, fecha: { gte: desdeStr } },
    });

    // porDia: rellenar días sin registros con ceros
    const porFecha = new Map();
    for (const m of metricas) {
      const entry = porFecha.get(m.fecha) ?? {
        tareasCompletadas: 0,
        tiempoEstimadoMin: 0,
        tiempoRealMin: 0,
        sesionesCompletadas: 0,
      };
      entry.tareasCompletadas += m.tareasCompletadas;
      entry.tiempoEstimadoMin += m.tiempoEstimadoMin;
      entry.tiempoRealMin += m.tiempoRealMin;
      entry.sesionesCompletadas += m.sesionesCompletadas;
      porFecha.set(m.fecha, entry);
    }
    const porDia = [];
    for (let i = 0; i < dias; i++) {
      const d = new Date(desde);
      d.setDate(d.getDate() + i);
      const fecha = dateToStr(d);
      porDia.push({
        fecha,
        ...(porFecha.get(fecha) ?? {
          tareasCompletadas: 0,
          tiempoEstimadoMin: 0,
          tiempoRealMin: 0,
          sesionesCompletadas: 0,
        }),
      });
    }

    const totales = porDia.reduce(
      (acc, d) => ({
        tareasCompletadas: acc.tareasCompletadas + d.tareasCompletadas,
        tiempoEstimadoMin: acc.tiempoEstimadoMin + d.tiempoEstimadoMin,
        tiempoRealMin: acc.tiempoRealMin + d.tiempoRealMin,
        sesionesCompletadas: acc.sesionesCompletadas + d.sesionesCompletadas,
      }),
      { tareasCompletadas: 0, tiempoEstimadoMin: 0, tiempoRealMin: 0, sesionesCompletadas: 0 }
    );
    totales.tareasCreadas = await prisma.tarea.count({
      where: { ...whereUsuario, creadoEn: { gte: desde } },
    });

    // rachaActual: días consecutivos (hasta hoy o ayer) con tareas completadas
    const rachaActual = calcularRacha(porFecha);

    // tasaCumplimiento: completadas / (completadas + abiertas no eliminadas)
    const abiertas = await prisma.tarea.count({
      where: { ...whereUsuario, estado: { in: ["pendiente", "en_progreso"] } },
    });
    const denominador = totales.tareasCompletadas + abiertas;
    const tasaCumplimiento =
      denominador > 0
        ? Math.round((totales.tareasCompletadas / denominador) * 100) / 100
        : 0;

    res.json({ porDia, totales, rachaActual, tasaCumplimiento });
  })
);

function calcularRacha(porFecha) {
  let racha = 0;
  const d = new Date();
  // Si hoy aún no hay tareas completadas, la racha no se rompe: empezar desde ayer.
  const hoyEntry = porFecha.get(dateToStr(d));
  if (!hoyEntry || hoyEntry.tareasCompletadas === 0) {
    d.setDate(d.getDate() - 1);
  }
  for (;;) {
    const entry = porFecha.get(dateToStr(d));
    if (entry && entry.tareasCompletadas > 0) {
      racha++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return racha;
}

export default metricsRouter;

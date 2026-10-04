import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../prisma.js";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError, asyncHandler } from "../utils/errors.js";
import { userShape } from "../utils/serialize.js";
import { sendWelcomeEmail, sendPasswordReset } from "../services/mailer.js";
import {
  issueTokenPair,
  findValidRefreshToken,
  revokeRefreshToken,
} from "../services/tokens.js";

export const authRouter = Router();

// Rate limiting básico en /auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes" } },
});
authRouter.use(authLimiter);

const MAX_INTENTOS = 5;
const BLOQUEO_MIN = 15;

// Correos "reales": además del formato, se rechazan dominios de prueba/desechables
// típicos. No se hace verificación MX para no depender de DNS en desarrollo.
const DOMINIOS_BLOQUEADOS = [
  "example.com", "example.org", "email.com", "test.com", "mail.com",
  "tempmail.com", "guerrillamail.com", "10minutemail.com", "yopmail.com",
  "trashmail.com", "fakeinbox.com", "sharklasers.com", "mailinator.com",
];
function esEmailReal(valor) {
  const dom = String(valor).split("@")[1]?.toLowerCase() ?? "";
  return !DOMINIOS_BLOQUEADOS.includes(dom);
}

const emailSchema = z
  .string()
  .email("email inválido")
  .refine(esEmailReal, { message: "usa un correo real (no de prueba ni desechable)" });

const registerSchema = z.object({
  body: z.object({
    nombre: z.string().min(1).max(120),
    email: emailSchema,
    password: z.string().min(8).max(128),
    aceptaTerminos: z.literal(true, {
      errorMap: () => ({ message: "debes aceptar los términos y condiciones" }),
    }),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
});

const forgotSchema = z.object({
  body: z.object({ email: z.string().email() }),
});

const resetSchema = z.object({
  body: z.object({
    token: z.string().min(10),
    password: z.string().min(8).max(128),
  }),
});

const refreshSchema = z.object({
  body: z.object({ refreshToken: z.string().min(10) }),
});

const logoutSchema = z.object({
  body: z.object({ refreshToken: z.string().min(10) }),
});

const patchMeSchema = z.object({
  body: z
    .object({
      nombre: z.string().min(1).max(120).optional(),
      zonaHoraria: z.string().min(1).max(60).optional(),
      temaPreferido: z.enum(["light", "dark", "system"]).optional(),
      avatarUrl: z
        .string()
        .max(400_000, "imagen demasiado grande")
        .regex(/^(https?:\/\/|data:image\/)/, "avatar inválido")
        .nullable()
        .optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: "body vacío" }),
});

async function estaBloqueado(email) {
  const desde = new Date(Date.now() - BLOQUEO_MIN * 60 * 1000);
  const fallos = await prisma.intentoLogin.count({
    where: { email, exitoso: false, creadoEn: { gte: desde } },
  });
  return fallos >= MAX_INTENTOS;
}

/**
 * El correo se guardaba tal cual se escribió, así que "Juan@x.com" y
 * "juan@x.com" son cuentas distintas y un login/reset fallaba en silencio.
 * Se buscan las variantes razonables y desde el registro se guarda en minúsculas.
 */
async function encontrarUsuarioPorEmail(email) {
  const crudo = String(email ?? "");
  const variantes = [...new Set([crudo, crudo.trim(), crudo.trim().toLowerCase()])];
  const encontrado = await prisma.usuario.findFirst({
    where: { email: { in: variantes } },
  });
  return encontrado ?? null;
}

// POST /auth/register → 201 { user, accessToken, refreshToken }
authRouter.post(
  "/register",
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { nombre, email, password } = req.body;
    const emailNormalizado = String(email).trim().toLowerCase();
    const existente = await encontrarUsuarioPorEmail(emailNormalizado);
    if (existente) {
      throw new ApiError(400, "EMAIL_EXISTS", "El email ya está registrado");
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const usuario = await prisma.usuario.create({
      data: {
        nombre,
        email: emailNormalizado,
        passwordHash,
        rol: "USER",
        aceptaTerminos: true,
        terminosAceptadoEn: new Date(),
      },
    });
    // Email de bienvenida (real si hay SMTP; si no, queda registrado en el log).
    await sendWelcomeEmail({ nombre: usuario.nombre, email: usuario.email });
    const tokens = await issueTokenPair(usuario);
    res.status(201).json({ user: userShape(usuario), ...tokens });
  })
);

// POST /auth/login → 200 { user, accessToken, refreshToken }
authRouter.post(
  "/login",
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Bloqueo temporal: 5 intentos fallidos → 15 min bloqueado (429 LOGIN_BLOCKED)
    if (await estaBloqueado(email)) {
      throw new ApiError(
        429,
        "LOGIN_BLOCKED",
        `Demasiados intentos fallidos. Cuenta bloqueada por ${BLOQUEO_MIN} minutos.`
      );
    }

    const usuario = await encontrarUsuarioPorEmail(email);
    const passwordOk =
      usuario && (await bcrypt.compare(password, usuario.passwordHash));

    await prisma.intentoLogin.create({
      data: { email, exitoso: Boolean(passwordOk) },
    });

    if (!passwordOk) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Credenciales inválidas");
    }

    const tokens = await issueTokenPair(usuario);
    res.json({ user: userShape(usuario), ...tokens });
  })
);

// POST /auth/refresh → 200 { accessToken, refreshToken } (rotación)
authRouter.post(
  "/refresh",
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const registro = await findValidRefreshToken(req.body.refreshToken);
    if (!registro) {
      throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Refresh token inválido o expirado");
    }
    // Rotación: revocar el anterior y emitir uno nuevo
    await revokeRefreshToken(registro.id);
    const tokens = await issueTokenPair(registro.usuario);
    res.json(tokens);
  })
);

// POST /auth/logout (protegida) → 204
authRouter.post(
  "/logout",
  requireAuth,
  validate(logoutSchema),
  asyncHandler(async (req, res) => {
    const registro = await prisma.refreshToken.findUnique({
      where: { token: req.body.refreshToken },
    });
    if (registro && registro.usuarioId === req.user.id && !registro.revocado) {
      await revokeRefreshToken(registro.id);
    }
    res.status(204).end();
  })
);

// POST /auth/forgot-password
// A diferencia del diseño habitual (202 siempre), aquí sí se avisa cuando el
// correo no está registrado: sin correo real configurado, un 202 de cortesía
// deja al usuario esperando un email que nunca llega.
authRouter.post(
  "/forgot-password",
  validate(forgotSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    const usuario = await encontrarUsuarioPorEmail(email);
    if (!usuario) {
      throw new ApiError(404, "EMAIL_NOT_FOUND", "Ese correo no está registrado en FocusFlow");
    }
    const raw = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
    await prisma.passwordResetToken.create({
      data: {
        usuarioId: usuario.id,
        tokenHash,
        expiraEn: new Date(Date.now() + 30 * 60 * 1000), // 30 min
      },
    });
    const envio = await sendPasswordReset({
      user: { nombre: usuario.nombre, email: usuario.email },
      token: raw,
    });
    if (!envio.delivered) {
      // El token ya existe: el enlace queda en el log para poder recuperarlo.
      console.error(`[auth] enlace de restablecimiento generado para ${usuario.email} pero el correo no se envió`);
      throw new ApiError(
        envio.sim ? 503 : 502,
        envio.sim ? "MAIL_NOT_CONFIGURED" : "MAIL_SEND_FAILED",
        envio.sim
          ? "El servidor no tiene un correo (SMTP) configurado, no se pudo enviar el enlace"
          : "El correo no se pudo enviar, intenta de nuevo en unos minutos"
      );
    }
    res.json({ ok: true, email: usuario.email });
  })
);

// POST /auth/reset-password → 200 { ok }
authRouter.post(
  "/reset-password",
  validate(resetSchema),
  asyncHandler(async (req, res) => {
    const { token, password } = req.body;
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const registro = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!registro || registro.usado || registro.expiraEn.getTime() < Date.now()) {
      throw new ApiError(400, "INVALID_RESET_TOKEN", "El enlace no es válido o expiró");
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.$transaction([
      prisma.usuario.update({ where: { id: registro.usuarioId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: registro.id }, data: { usado: true } }),
      // Invalida sesiones activas del usuario tras cambiar la contraseña.
      prisma.refreshToken.updateMany({
        where: { usuarioId: registro.usuarioId, revocado: false },
        data: { revocado: true },
      }),
    ]);
    res.json({ ok: true });
  })
);

// Router separado para /api/me (montado directamente sobre /api en app.js).
// IMPORTANTE: requireAuth se aplica POR RUTA (no con .use()) porque este router
// va montado en "/api"; si usáramos .use(requireAuth) bloquearía TODAS las rutas
// bajo /api que pasen por aquí (p. ej. la pública /api/payments/plans).
export const meRouter = Router();

// GET /me → 200 { user }
meRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  })
);

// PATCH /me → 200 { user }
meRouter.patch(
  "/me",
  requireAuth,
  validate(patchMeSchema),
  asyncHandler(async (req, res) => {
    const usuario = await prisma.usuario.update({
      where: { id: req.user.id },
      data: req.body,
    });
    res.json({ user: userShape(usuario) });
  })
);

export default authRouter;

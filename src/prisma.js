import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "focusflow-dev-access-secret-change-me",
  jwtRefreshSecret:
    process.env.JWT_REFRESH_SECRET || "focusflow-dev-refresh-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "30m",
  jwtRefreshExpiresDays: Number(process.env.JWT_REFRESH_EXPIRES_DAYS || 7),
  // Orígenes de la WebView nativa (Capacitor). Son fijos y no dependen del
  // despliegue, así que se suman siempre: sin ellos la app de celular no puede
  // hablar con la API aunque CORS_ORIGINS esté bien configurado.
  corsOrigins: [
    ...new Set([
      ...(process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:1420")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      "https://localhost", // Android (androidScheme https, por defecto)
      "http://localhost", // Android con androidScheme http
      "capacitor://localhost", // iOS
    ]),
  ],
  // SMTP (emails reales). Si SMTP_HOST no está, el mailer corre en modo "sim".
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    // MAIL_FROM es opcional: por defecto se envía desde la misma cuenta de SMTP_USER
    // (Gmail rechaza el envío si el "desde" no es la cuenta autenticada).
    from:
      process.env.MAIL_FROM ||
      (process.env.SMTP_USER
        ? `FocusFlow <${process.env.SMTP_USER}>`
        : "FocusFlow <no-reply@focusflow.app>"),
    appUrl: process.env.APP_URL || "http://localhost:5173",
  },
};

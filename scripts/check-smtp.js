// Verifica si el SMTP realmente puede enviar: npm run check:smtp -- tu@email.com
// Usa las mismas variables que el server (SMTP_HOST/PORT/SECURE/USER/PASS/MAIL_FROM).
import nodemailer from "nodemailer";

const to = process.argv[2];
const host = process.env.SMTP_HOST || "";
const port = Number(process.env.SMTP_PORT || 587);
const secure = String(process.env.SMTP_SECURE || "false") === "true";
const user = process.env.SMTP_USER || "";
const pass = process.env.SMTP_PASS || "";
const from = process.env.MAIL_FROM || "FocusFlow <no-reply@focusflow.app>";

if (!to) {
  console.error("Falta el destinatario: node scripts/check-smtp.js tu@email.com");
  process.exit(1);
}
if (!host || !user) {
  console.error("[smtp] NO CONFIGURADO → SMTP_HOST/SMTP_USER vacíos. El mailer está en modo simulación.");
  process.exit(1);
}

const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
try {
  const info = await transporter.verify();
  console.log("[smtp] conexión OK:", info?.accepted ? info.accepted : host);
} catch (err) {
  console.error(`[smtp] fallo de conexión: ${err.message}`);
  process.exit(1);
}

try {
  const info = await transporter.sendMail({
    from,
    to,
    subject: "Prueba de correo FocusFlow",
    text: "Si llegaste hasta aquí, el SMTP está configurado correctamente.",
  });
  console.log(`[smtp] enviado a ${to} · id ${info.messageId}`);
} catch (err) {
  console.error(`[smtp] fallo al enviar: ${err.message}`);
  process.exit(1);
}

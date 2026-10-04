import nodemailer from "nodemailer";
import { config } from "../prisma.js";

// ---------------------------------------------------------------------------
// Mailer: envía correos REALES por SMTP cuando está configurado (SMTP_HOST).
// Si no lo está, NO rompe la app: registra el correo en consola (modo sim).
// Configura SMTP_HOST/PORT/USER/PASS/MAIL_FROM en backend/.env para activarlo.
// ---------------------------------------------------------------------------

const { smtp } = config;
const isLive = Boolean(smtp.host && smtp.user);

const transporter = isLive
  ? nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
    })
  : null;

export function mailerStatus() {
  return isLive ? { live: true, host: smtp.host, from: smtp.from } : { live: false };
}

async function send({ to, subject, html, text }) {
  if (transporter) {
    try {
      await transporter.sendMail({ from: smtp.from, to, subject, html, text });
      return { delivered: true };
    } catch (err) {
      console.error(`[mailer] fallo al enviar a ${to}: ${err.message}`);
      return { delivered: false, error: err.message };
    }
  }
  // Modo sim (sin SMTP configurado): se deja rastro en el log del servidor.
  console.log(`[mailer:sim] → ${to} · ${subject}\n  ${text ?? "(html)"}`);
  return { delivered: false, sim: true };
}

function layout(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#070B14;font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#e2e8f0;padding:32px">
  <div style="max-width:560px;margin:0 auto;background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:28px">
    <div style="font-size:20px;font-weight:800;color:#4C6FFF;margin-bottom:16px">FocusFlow</div>
    <h1 style="font-size:18px;margin:0 0 12px">${title}</h1>
    <div style="font-size:14px;line-height:1.6;color:#cbd5e1">${bodyHtml}</div>
    <p style="margin-top:24px;font-size:12px;color:#64748b">Este es un mensaje automático de FocusFlow.</p>
  </div></body></html>`;
}

export async function sendWelcomeEmail(user) {
  return send({
    to: user.email,
    subject: "Bienvenido a FocusFlow",
    text: `Hola ${user.nombre}, tu cuenta en FocusFlow está lista. Organiza tu día con la Matriz de Eisenhower, el Pomodoro y el Time-Blocking.`,
    html: layout(
      `Hola ${user.nombre}, ¡bienvenido!`,
      `<p>Tu cuenta en <b>FocusFlow</b> está lista. Empieza a organizar tu día con la Matriz de Eisenhower, el temporizador Pomodoro y el Time-Blocking.</p>
       <p><a href="${smtp.appUrl}" style="display:inline-block;background:#4C6FFF;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none">Ir a FocusFlow</a></p>`,
    ),
  });
}

export async function sendPaymentReceipt({ user, planNombre, monto, moneda, metodo, estado, referencia }) {
  const estadoLabel = { completado: "Completado", fallido: "Fallido", pendiente: "Pendiente" }[estado] || estado;
  return send({
    to: user.email,
    subject: `Recibo de pago — ${planNombre} (${estadoLabel})`,
    text: `Hola ${user.nombre}, tu pago por el plan ${planNombre} quedó ${estadoLabel}. Monto: ${monto} ${moneda}. Método: ${metodo}. Referencia: ${referencia}.`,
    html: layout(
      `Recibo de pago: ${estadoLabel}`,
      `<p>Hola ${user.nombre}, el pago del plan <b>${planNombre}</b> quedó en estado <b>${estadoLabel}</b>.</p>
       <ul>
         <li>Monto: ${monto} ${moneda}</li>
         <li>Método: ${metodo}</li>
         <li>Referencia: ${referencia}</li>
       </ul>`,
    ),
  });
}

export async function sendPasswordReset({ user, token }) {
  const url = `${smtp.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  return send({
    to: user.email,
    subject: "Restablece tu contraseña de FocusFlow",
    text: `Hola ${user.nombre}, usa este enlace para restablecer tu contraseña (válido 30 minutos): ${url}`,
    html: layout(
      "Restablecer contraseña",
      `<p>Hola ${user.nombre}, solicitaste restablecer tu contraseña.</p>
       <p><a href="${url}" style="display:inline-block;background:#4C6FFF;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none">Restablecer contraseña</a></p>
       <p style="color:#94a3b8">Este enlace vence en 30 minutos. Si no solicitaste el cambio, ignora este correo.</p>`,
    ),
  });
}

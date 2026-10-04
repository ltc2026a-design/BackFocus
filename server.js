import { createApp } from "./src/app.js";
import { config } from "./src/prisma.js";
import { generarNotificacionesDeadline } from "./src/services/notifications.js";

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`[FocusFlow] API escuchando en http://localhost:${config.port}/api`);
  console.log(`[FocusFlow] CORS habilitado para: ${config.corsOrigins.join(", ")}`);
});

// Cron simple con setInterval: cada 10 minutos revisa tareas con fechaLimite
// en las próximas 24h y genera notificaciones `deadline` (sin duplicar).
const CRON_INTERVAL_MIN = 10;
const cronTimer = setInterval(async () => {
  try {
    const resultado = await generarNotificacionesDeadline();
    if (resultado.creadas > 0) {
      console.log(`[FocusFlow cron] Notificaciones deadline creadas: ${resultado.creadas}`);
    }
  } catch (err) {
    console.error("[FocusFlow cron] Error:", err.message);
  }
}, CRON_INTERVAL_MIN * 60 * 1000);
cronTimer.unref?.();

// Ejecución inicial al arrancar (no bloqueante)
generarNotificacionesDeadline().catch(() => {});

const shutdown = () => {
  clearInterval(cronTimer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export default server;

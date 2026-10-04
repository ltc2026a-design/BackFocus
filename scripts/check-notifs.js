// Ejecutable con `npm run check:notifs` — genera notificaciones deadline una vez y sale.
import { generarNotificacionesDeadline } from "../src/services/notifications.js";
import { prisma } from "../src/prisma.js";

try {
  const resultado = await generarNotificacionesDeadline();
  console.log(
    `[check-notifs] Tareas revisadas: ${resultado.revisadas}, notificaciones creadas: ${resultado.creadas}`
  );
} catch (err) {
  console.error("[check-notifs] Error:", err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

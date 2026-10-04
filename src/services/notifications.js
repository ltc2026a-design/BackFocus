import { prisma } from "../prisma.js";

// Cron simple: genera Notificacion tipo `deadline` para tareas con fechaLimite
// en las próximas 24 horas. No duplica: si ya existe una notificación `deadline`
// NO LEÍDA para la misma tarea, se omite.
export async function generarNotificacionesDeadline() {
  const now = new Date();
  const en24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const tareas = await prisma.tarea.findMany({
    where: {
      estado: { in: ["pendiente", "en_progreso"] },
      fechaLimite: { gte: now, lte: en24h },
    },
    include: { usuario: { select: { id: true, nombre: true } } },
  });

  let creadas = 0;
  for (const tarea of tareas) {
    const existente = await prisma.notificacion.findFirst({
      where: {
        usuarioId: tarea.usuarioId,
        tipo: "deadline",
        tareaId: tarea.id,
        leida: false,
      },
      select: { id: true },
    });
    if (existente) continue;

    await prisma.notificacion.create({
      data: {
        usuarioId: tarea.usuarioId,
        tipo: "deadline",
        mensaje: `La tarea "${tarea.titulo}" vence en menos de 24 horas (${tarea.fechaLimite.toISOString()}).`,
        programadaPara: tarea.fechaLimite,
        tareaId: tarea.id,
      },
    });
    creadas++;
  }
  return { revisadas: tareas.length, creadas };
}

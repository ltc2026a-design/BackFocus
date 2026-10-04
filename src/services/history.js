import { prisma } from "../prisma.js";

// Registra un EventoHistorial (todas las acciones de crear/editar/eliminar de
// tareas, micro-tareas, proyectos, pomodoro y pagos pasan por aquí).
export async function logEvent({ usuarioId, entidadTipo, entidadId, accion, detalle }) {
  return prisma.eventoHistorial.create({
    data: {
      usuarioId,
      entidadTipo,
      entidadId: String(entidadId),
      accion,
      detalle: detalle ?? null,
    },
  });
}

import { prisma } from "../prisma.js";

export function fechaHoy() {
  return dateToStr(new Date());
}

export function dateToStr(d) {
  return d.toISOString().slice(0, 10);
}

// Incrementa (o crea) la MetricaDiaria del usuario para una fecha dada.
export async function incrementarMetrica(usuarioId, fecha, deltas = {}) {
  return prisma.metricaDiaria.upsert({
    where: { usuarioId_fecha: { usuarioId, fecha } },
    create: {
      usuarioId,
      fecha,
      tareasCompletadas: deltas.tareasCompletadas ?? 0,
      tiempoEstimadoMin: deltas.tiempoEstimadoMin ?? 0,
      tiempoRealMin: deltas.tiempoRealMin ?? 0,
      sesionesCompletadas: deltas.sesionesCompletadas ?? 0,
    },
    update: {
      tareasCompletadas: { increment: deltas.tareasCompletadas ?? 0 },
      tiempoEstimadoMin: { increment: deltas.tiempoEstimadoMin ?? 0 },
      tiempoRealMin: { increment: deltas.tiempoRealMin ?? 0 },
      sesionesCompletadas: { increment: deltas.sesionesCompletadas ?? 0 },
    },
  });
}

import { ApiError } from "./errors.js";

// Serializadores: devuelven EXACTAMENTE los shapes del contrato de API.

export const userShape = (u) => ({
  id: u.id,
  nombre: u.nombre,
  email: u.email,
  rol: u.rol,
  zonaHoraria: u.zonaHoraria,
  temaPreferido: u.temaPreferido,
  avatarUrl: u.avatarUrl ?? null,
  aceptaTerminos: u.aceptaTerminos ?? false,
  creadoEn: u.creadoEn,
});

export const projectShape = (p) => ({
  id: p.id,
  titulo: p.titulo,
  descripcion: p.descripcion ?? null,
  estado: p.estado,
  creadoEn: p.creadoEn,
  ...(p._count ? { _count: { tareas: p._count.tareas } } : {}),
});

export const subtaskShape = (s) => ({
  id: s.id,
  tareaId: s.tareaId,
  titulo: s.titulo,
  completada: s.completada,
  orden: s.orden,
  creadoEn: s.creadoEn,
});

export const taskShape = (t) => ({
  id: t.id,
  titulo: t.titulo,
  descripcion: t.descripcion ?? null,
  cuadrante: t.cuadrante,
  estado: t.estado,
  fechaLimite: t.fechaLimite ?? null,
  tiempoEstimadoMin: t.tiempoEstimadoMin ?? null,
  proyectoId: t.proyectoId ?? null,
  creadoEn: t.creadoEn,
  microTareas: (t.microTareas ?? [])
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .map(subtaskShape),
  ...(t.usuario ? { usuario: userShape(t.usuario) } : {}),
});

export const pomodoroShape = (s) => ({
  id: s.id,
  tareaId: s.tareaId ?? null,
  inicio: s.inicio,
  fin: s.fin ?? null,
  duracionPlaneadaMin: s.duracionPlaneadaMin,
  duracionRealMin: s.duracionRealMin ?? null,
  tipo: s.tipo,
  estado: s.estado,
  completada: s.completada,
});

export const timeBlockShape = (b) => ({
  id: b.id,
  tareaId: b.tareaId,
  fecha: b.fecha,
  horaInicio: b.horaInicio,
  horaFin: b.horaFin,
  ...(b.tarea
    ? { tarea: { id: b.tarea.id, titulo: b.tarea.titulo, cuadrante: b.tarea.cuadrante } }
    : {}),
});

export const historyShape = (e) => ({
  id: e.id,
  entidadTipo: e.entidadTipo,
  entidadId: e.entidadId,
  accion: e.accion,
  detalle: e.detalle ?? null,
  creadoEn: e.creadoEn,
  ...(e.usuario ? { usuario: userShape(e.usuario) } : {}),
});

export const notificationShape = (n) => ({
  id: n.id,
  tipo: n.tipo,
  mensaje: n.mensaje,
  leida: n.leida,
  programadaPara: n.programadaPara ?? null,
  creadoEn: n.creadoEn,
});

export const planShape = (p) => ({
  id: p.id,
  tipo: p.tipo,
  nombre: p.nombre,
  precioMensual: p.precioMensual,
  precioAnual: p.precioAnual ?? null,
  descripcion: p.descripcion ?? null,
  caracteristicas: safeJsonParse(p.caracteristicas, []),
});

export const paymentShape = (p) => ({
  id: p.id,
  usuarioId: p.usuarioId,
  planTipo: p.planTipo,
  monto: p.monto,
  moneda: p.moneda,
  metodo: p.metodo,
  ciclo: p.ciclo,
  estado: p.estado,
  referencia: p.referencia,
  detalleTarjeta: p.detalleTarjeta ? safeJsonParse(p.detalleTarjeta, null) : null,
  creadoEn: p.creadoEn,
  ...(p.usuario ? { usuario: userShape(p.usuario) } : {}),
});

export const subscriptionShape = (s) =>
  s
    ? { planTipo: s.planTipo, activa: s.activa, desde: s.desde, hasta: s.hasta ?? null }
    : null;

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export { ApiError };

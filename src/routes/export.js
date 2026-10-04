import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/errors.js";

export const exportRouter = Router();
exportRouter.use(requireAuth);

const querySchema = z.object({
  query: z.object({ format: z.enum(["csv", "json"]).default("csv") }),
});

// ---------------------------------------------------------------------------
// Etiquetas legibles en español (los IDs se conservan, pero se añaden nombres)
// ---------------------------------------------------------------------------
const CUADRANTE = {
  urgente_importante: "Urgente e Importante",
  urgente_no_importante: "Urgente, No Importante",
  no_urgente_importante: "No Urgente, Importante",
  no_urgente_no_importante: "No Urgente, No Importante",
};
const ESTADO_TAREA = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completada: "Completada",
  eliminada: "Eliminada",
};
const TIPO_POMO = { trabajo: "Trabajo", descanso: "Descanso" };
const ESTADO_POMO = {
  activa: "Activa",
  pausada: "Pausada",
  completada: "Completada",
  cancelada: "Cancelada",
};
const ENTIDAD = {
  tarea: "Tarea",
  micro_tarea: "Micro-tarea",
  proyecto: "Proyecto",
  pomodoro: "Pomodoro",
  pago: "Pago",
  auth: "Autenticación",
};
const ACCION = {
  crear: "Crear",
  editar: "Editar",
  eliminar: "Eliminar",
  completar: "Completar",
  cambiar_cuadrante: "Cambiar cuadrante",
  cambiar_estado: "Cambiar estado",
  iniciar: "Iniciar",
  pausar: "Pausar",
  reanudar: "Reanudar",
  finalizar: "Finalizar",
};

const pick = (map, key) => map[key] ?? key ?? "";
const fecha = (d) => (d ? new Date(d).toISOString() : "");

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
const toCsvRow = (values) => values.map(csvEscape).join(",");

// GET /export?format=csv|json → datos legibles del usuario autenticado.
exportRouter.get(
  "/",
  validate(querySchema),
  asyncHandler(async (req, res) => {
    const format = req.validatedQuery.format;
    const usuarioId = req.user.id;

    const [tareas, sesiones, historial] = await prisma.$transaction([
      prisma.tarea.findMany({
        where: { usuarioId },
        orderBy: { creadoEn: "desc" },
        include: {
          proyecto: true,
          microTareas: { orderBy: { orden: "asc" } },
        },
      }),
      prisma.sesionPomodoro.findMany({
        where: { usuarioId },
        orderBy: { inicio: "desc" },
        include: { tarea: { select: { id: true, titulo: true } } },
      }),
      prisma.eventoHistorial.findMany({
        where: { usuarioId },
        orderBy: { creadoEn: "desc" },
      }),
    ]);

    // Micro-tareas aplanadas con el título de su tarea padre.
    const tituloPorTarea = new Map(tareas.map((t) => [t.id, t.titulo]));
    const microTareas = tareas.flatMap((t) =>
      t.microTareas.map((s) => ({ ...s, _tituloTarea: t.titulo })),
    );

    // Resolver el nombre de la entidad del historial cuando es posible.
    const pagos = await prisma.pago.findMany({ where: { usuarioId }, select: { id: true, referencia: true } });
    const referenciaPorPago = new Map(pagos.map((p) => [p.id, p.referencia]));
    const entidadNombre = (tipo, id) => {
      if (tipo === "tarea" || tipo === "micro_tarea") return tituloPorTarea.get(id) ?? "";
      if (tipo === "pago") return referenciaPorPago.get(id) ?? "";
      return "";
    };

    const dataTareas = tareas.map((t) => ({
      id: t.id,
      titulo: t.titulo,
      descripcion: t.descripcion ?? "",
      cuadrante: t.cuadrante,
      cuadrante_label: pick(CUADRANTE, t.cuadrante),
      estado: t.estado,
      estado_label: pick(ESTADO_TAREA, t.estado),
      fechaLimite: fecha(t.fechaLimite),
      tiempoEstimadoMin: t.tiempoEstimadoMin ?? null,
      proyectoId: t.proyectoId ?? "",
      proyectoNombre: t.proyecto?.titulo ?? "",
      creadoEn: t.creadoEn.toISOString(),
    }));

    const dataMicro = microTareas.map((s) => ({
      id: s.id,
      tareaId: s.tareaId,
      tareaNombre: s._tituloTarea ?? "",
      titulo: s.titulo,
      completada: s.completada,
      orden: s.orden,
      creadoEn: s.creadoEn.toISOString(),
    }));

    const dataSesiones = sesiones.map((p) => ({
      id: p.id,
      tareaId: p.tareaId ?? "",
      tareaNombre: p.tarea?.titulo ?? "",
      inicio: fecha(p.inicio),
      fin: fecha(p.fin),
      duracionPlaneadaMin: p.duracionPlaneadaMin,
      duracionRealMin: p.duracionRealMin ?? null,
      tipo: p.tipo,
      tipo_label: pick(TIPO_POMO, p.tipo),
      estado: p.estado,
      estado_label: pick(ESTADO_POMO, p.estado),
      completada: p.completada,
    }));

    const dataHistorial = historial.map((h) => ({
      id: h.id,
      entidadTipo: h.entidadTipo,
      entidad_label: pick(ENTIDAD, h.entidadTipo),
      entidadId: h.entidadId,
      entidadNombre: entidadNombre(h.entidadTipo, h.entidadId),
      accion: h.accion,
      accion_label: pick(ACCION, h.accion),
      detalle: h.detalle ?? "",
      creadoEn: h.creadoEn.toISOString(),
    }));

    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "json") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="focusflow-export-${stamp}.json"`,
      );
      return res.json({
        exportadoEn: new Date().toISOString(),
        usuario: { id: req.user.id, nombre: req.user.nombre, email: req.user.email },
        tareas: dataTareas,
        microTareas: dataMicro,
        sesionesPomodoro: dataSesiones,
        historial: dataHistorial,
      });
    }

    // CSV legible: columnas con nombre + etiqueta, IDs al final de cada bloque.
    const lines = [];
    lines.push(`# Exportación FocusFlow,${csvEscape(req.user.nombre)},${csvEscape(req.user.email)},${new Date().toISOString()}`);
    lines.push("");
    lines.push("## TAREAS");
    lines.push(toCsvRow(["titulo", "cuadrante", "estado", "fechaLimite", "tiempoEstimadoMin", "proyecto", "descripcion", "id"]));
    for (const t of dataTareas) {
      lines.push(toCsvRow([t.titulo, t.cuadrante_label, t.estado_label, t.fechaLimite, t.tiempoEstimadoMin ?? "", t.proyectoNombre, t.descripcion, t.id]));
    }
    lines.push("");
    lines.push("## MICRO-TAREAS");
    lines.push(toCsvRow(["titulo", "tarea_padre", "completada", "orden", "creadoEn", "id"]));
    for (const s of dataMicro) {
      lines.push(toCsvRow([s.titulo, s.tareaNombre, s.completada ? "Sí" : "No", s.orden, s.creadoEn, s.id]));
    }
    lines.push("");
    lines.push("## SESIONES POMODORO");
    lines.push(toCsvRow(["tipo", "estado", "tarea", "inicio", "fin", "planeadaMin", "realMin", "completada", "id"]));
    for (const p of dataSesiones) {
      lines.push(toCsvRow([p.tipo_label, p.estado_label, p.tareaNombre, p.inicio, p.fin, p.duracionPlaneadaMin, p.duracionRealMin ?? "", p.completada ? "Sí" : "No", p.id]));
    }
    lines.push("");
    lines.push("## HISTORIAL");
    lines.push(toCsvRow(["fecha", "entidad", "nombre", "accion", "detalle", "id"]));
    for (const h of dataHistorial) {
      lines.push(toCsvRow([h.creadoEn, h.entidad_label, h.entidadNombre, h.accion_label, h.detalle, h.id]));
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="focusflow-export-${stamp}.csv"`,
    );
    res.send(lines.join("\r\n"));
  })
);

export default exportRouter;

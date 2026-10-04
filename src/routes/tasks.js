import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ApiError, asyncHandler, notFound, assertOwnerOrAdmin } from "../utils/errors.js";
import { taskShape, subtaskShape } from "../utils/serialize.js";
import { logEvent } from "../services/history.js";
import { incrementarMetrica, fechaHoy } from "../services/metrics.js";

export const CUADRANTES = [
  "urgente_importante",
  "urgente_no_importante",
  "no_urgente_importante",
  "no_urgente_no_importante",
];
export const ESTADOS_TAREA = ["pendiente", "en_progreso", "completada", "eliminada"];

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

const zCuadrante = z.enum(CUADRANTES);
const zEstado = z.enum(ESTADOS_TAREA);

const listQuerySchema = z.object({
  query: z.object({
    proyectoId: z.string().optional(),
    estado: zEstado.optional(),
    cuadrante: zCuadrante.optional(),
  }),
});

const createSchema = z.object({
  body: z.object({
    titulo: z.string().min(1).max(300),
    descripcion: z.string().max(5000).optional(),
    cuadrante: zCuadrante,
    fechaLimite: z.coerce.date().optional(),
    tiempoEstimadoMin: z.number().int().min(0).max(100000).optional(),
    proyectoId: z.string().optional(),
  }),
});

const patchSchema = z.object({
  body: z
    .object({
      titulo: z.string().min(1).max(300).optional(),
      descripcion: z.string().max(5000).nullable().optional(),
      cuadrante: zCuadrante.optional(),
      estado: zEstado.optional(),
      fechaLimite: z.coerce.date().nullable().optional(),
      tiempoEstimadoMin: z.number().int().min(0).max(100000).nullable().optional(),
      proyectoId: z.string().nullable().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: "body vacío" }),
});

const subtaskCreateSchema = z.object({
  body: z.object({ titulo: z.string().min(1).max(300) }),
});

const subtaskPatchSchema = z.object({
  body: z
    .object({
      titulo: z.string().min(1).max(300).optional(),
      completada: z.boolean().optional(),
      orden: z.number().int().min(0).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: "body vacío" }),
});

const taskInclude = { microTareas: { orderBy: { orden: "asc" } } };

async function findTaskForUser(id, user) {
  const tarea = notFound(
    await prisma.tarea.findUnique({ where: { id }, include: taskInclude }),
    "Tarea no encontrada"
  );
  assertOwnerOrAdmin(tarea, user, "Tarea ajena");
  return tarea;
}

// GET /tasks?proyectoId=&estado=&cuadrante= → { data: Task[] }
tasksRouter.get(
  "/",
  validate(listQuerySchema),
  asyncHandler(async (req, res) => {
    const { proyectoId, estado, cuadrante } = req.validatedQuery;
    const where = {
      ...(req.user.rol === "ADMIN" && req.query.all === "true" ? {} : { usuarioId: req.user.id }),
      ...(proyectoId ? { proyectoId } : {}),
      ...(estado ? { estado } : { estado: { not: "eliminada" } }),
      ...(cuadrante ? { cuadrante } : {}),
    };
    const tareas = await prisma.tarea.findMany({
      where,
      orderBy: { creadoEn: "desc" },
      include: taskInclude,
    });
    res.json({ data: tareas.map(taskShape) });
  })
);

// POST /tasks → 201 Task
tasksRouter.post(
  "/",
  validate(createSchema),
  asyncHandler(async (req, res) => {
    if (req.body.proyectoId) {
      const proyecto = await prisma.proyecto.findUnique({ where: { id: req.body.proyectoId } });
      notFound(proyecto, "Proyecto no encontrado");
      assertOwnerOrAdmin(proyecto, req.user, "Proyecto ajeno");
    }
    const tarea = await prisma.tarea.create({
      data: { ...req.body, usuarioId: req.user.id },
      include: taskInclude,
    });
    await logEvent({
      usuarioId: req.user.id,
      entidadTipo: "tarea",
      entidadId: tarea.id,
      accion: "crear",
      detalle: `Tarea "${tarea.titulo}" creada en cuadrante ${tarea.cuadrante}`,
    });
    res.status(201).json(taskShape(tarea));
  })
);

// GET /tasks/:id → Task
tasksRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const tarea = await findTaskForUser(req.params.id, req.user);
    res.json(taskShape(tarea));
  })
);

// PATCH /tasks/:id → Task (parcial; incluye cuadrante y estado)
tasksRouter.patch(
  "/:id",
  validate(patchSchema),
  asyncHandler(async (req, res) => {
    const anterior = await findTaskForUser(req.params.id, req.user);
    const data = { ...req.body };

    // Transición a completada → actualizar MetricaDiaria del día
    if (data.estado === "completada" && anterior.estado !== "completada") {
      data.completadaEn = new Date();
      await incrementarMetrica(req.user.id, fechaHoy(), {
        tareasCompletadas: 1,
        tiempoEstimadoMin: anterior.tiempoEstimadoMin ?? 0,
      });
    }
    if (data.estado && data.estado !== "completada") {
      data.completadaEn = null;
    }

    const tarea = await prisma.tarea.update({
      where: { id: anterior.id },
      data,
      include: taskInclude,
    });

    // Historial: cambio de cuadrante y/o edición general
    if (req.body.cuadrante && req.body.cuadrante !== anterior.cuadrante) {
      await logEvent({
        usuarioId: req.user.id,
        entidadTipo: "tarea",
        entidadId: tarea.id,
        accion: "cambiar_cuadrante",
        detalle: `Cuadrante cambiado de ${anterior.cuadrante} a ${tarea.cuadrante}`,
      });
    }
    await logEvent({
      usuarioId: req.user.id,
      entidadTipo: "tarea",
      entidadId: tarea.id,
      accion: data.estado === "completada" && anterior.estado !== "completada" ? "completar" : "editar",
      detalle: `Tarea editada: ${JSON.stringify(req.body)}`,
    });

    res.json(taskShape(tarea));
  })
);

// DELETE /tasks/:id → 204 (soft-delete: estado=eliminada)
tasksRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const tarea = await findTaskForUser(req.params.id, req.user);
    await prisma.tarea.update({
      where: { id: tarea.id },
      data: { estado: "eliminada" },
    });
    await logEvent({
      usuarioId: req.user.id,
      entidadTipo: "tarea",
      entidadId: tarea.id,
      accion: "eliminar",
      detalle: `Tarea "${tarea.titulo}" eliminada (soft-delete)`,
    });
    res.status(204).end();
  })
);

// --- Micro-tareas -----------------------------------------------------------

// GET /tasks/:taskId/subtasks → { data: Subtask[] }
tasksRouter.get(
  "/:taskId/subtasks",
  asyncHandler(async (req, res) => {
    const tarea = await findTaskForUser(req.params.taskId, req.user);
    const subs = await prisma.microTarea.findMany({
      where: { tareaId: tarea.id },
      orderBy: { orden: "asc" },
    });
    res.json({ data: subs.map(subtaskShape) });
  })
);

// POST /tasks/:taskId/subtasks → 201 Subtask
tasksRouter.post(
  "/:taskId/subtasks",
  validate(subtaskCreateSchema),
  asyncHandler(async (req, res) => {
    const tarea = await findTaskForUser(req.params.taskId, req.user);
    if (tarea.estado === "eliminada") {
      throw new ApiError(400, "PARENT_DELETED", "La tarea padre está eliminada");
    }
    const maxOrden = await prisma.microTarea.aggregate({
      where: { tareaId: tarea.id },
      _max: { orden: true },
    });
    const sub = await prisma.microTarea.create({
      data: {
        tareaId: tarea.id,
        titulo: req.body.titulo,
        orden: (maxOrden._max.orden ?? -1) + 1,
      },
    });
    await logEvent({
      usuarioId: req.user.id,
      entidadTipo: "micro_tarea",
      entidadId: sub.id,
      accion: "crear",
      detalle: `Micro-tarea "${sub.titulo}" creada en tarea "${tarea.titulo}"`,
    });
    res.status(201).json(subtaskShape(sub));
  })
);

async function findSubtaskForUser(id, user) {
  const sub = notFound(
    await prisma.microTarea.findUnique({ where: { id }, include: { tarea: true } }),
    "Micro-tarea no encontrada"
  );
  assertOwnerOrAdmin(sub.tarea, user, "Micro-tarea ajena");
  return sub;
}

// Router independiente montado en /api/subtasks (ver app.js)
export const subtasksRouter = Router();
subtasksRouter.use(requireAuth);

// PATCH /subtasks/:id → Subtask (400 PARENT_DELETED si el padre está eliminado
// y se intenta marcar completada)
subtasksRouter.patch(
  "/:id",
  validate(subtaskPatchSchema),
  asyncHandler(async (req, res) => {
    const sub = await findSubtaskForUser(req.params.id, req.user);
    if (
      req.body.completada === true &&
      !sub.completada &&
      sub.tarea.estado === "eliminada"
    ) {
      throw new ApiError(
        400,
        "PARENT_DELETED",
        "No se puede completar una micro-tarea cuya tarea padre fue eliminada"
      );
    }
    const actualizada = await prisma.microTarea.update({
      where: { id: sub.id },
      data: req.body,
    });
    await logEvent({
      usuarioId: req.user.id,
      entidadTipo: "micro_tarea",
      entidadId: actualizada.id,
      accion: req.body.completada === true ? "completar" : "editar",
      detalle: `Micro-tarea editada: ${JSON.stringify(req.body)}`,
    });
    res.json(subtaskShape(actualizada));
  })
);

// DELETE /subtasks/:id → 204
subtasksRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const sub = await findSubtaskForUser(req.params.id, req.user);
    await prisma.microTarea.delete({ where: { id: sub.id } });
    await logEvent({
      usuarioId: req.user.id,
      entidadTipo: "micro_tarea",
      entidadId: sub.id,
      accion: "eliminar",
      detalle: `Micro-tarea "${sub.titulo}" eliminada`,
    });
    res.status(204).end();
  })
);

export default tasksRouter;

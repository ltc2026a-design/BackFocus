import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ApiError, asyncHandler, notFound, assertOwnerOrAdmin } from "../utils/errors.js";
import { pomodoroShape } from "../utils/serialize.js";
import { logEvent } from "../services/history.js";
import { incrementarMetrica, fechaHoy } from "../services/metrics.js";

export const pomodoroRouter = Router();
pomodoroRouter.use(requireAuth);

const startSchema = z.object({
  body: z.object({
    duracionPlaneadaMin: z.number().int().min(1).max(600),
    tipo: z.enum(["trabajo", "descanso"]),
    tareaId: z.string().optional(),
  }),
});

const finishSchema = z.object({
  body: z.object({ completada: z.boolean() }),
});

async function findSessionForUser(id, user) {
  const sesion = notFound(
    await prisma.sesionPomodoro.findUnique({ where: { id } }),
    "Sesión pomodoro no encontrada"
  );
  assertOwnerOrAdmin(sesion, user, "Sesión pomodoro ajena");
  return sesion;
}

// Minutos transcurridos desde la última reanudación (o inicio).
function minutosActivos(sesion, hasta = new Date()) {
  const desde = sesion.reanudadoEn ?? sesion.inicio;
  return Math.max(0, Math.round((hasta.getTime() - desde.getTime()) / 60000));
}

// POST /pomodoro/start → 201 PomodoroSession (estado activa, inicio=now)
pomodoroRouter.post(
  "/start",
  validate(startSchema),
  asyncHandler(async (req, res) => {
    if (req.body.tareaId) {
      const tarea = await prisma.tarea.findUnique({ where: { id: req.body.tareaId } });
      notFound(tarea, "Tarea no encontrada");
      assertOwnerOrAdmin(tarea, req.user, "Tarea ajena");
    }
    const now = new Date();
    const sesion = await prisma.sesionPomodoro.create({
      data: {
        usuarioId: req.user.id,
        tareaId: req.body.tareaId ?? null,
        duracionPlaneadaMin: req.body.duracionPlaneadaMin,
        tipo: req.body.tipo,
        estado: "activa",
        inicio: now,
        reanudadoEn: now,
      },
    });
    await logEvent({
      usuarioId: req.user.id,
      entidadTipo: "pomodoro",
      entidadId: sesion.id,
      accion: "iniciar",
      detalle: `Sesión ${sesion.tipo} de ${sesion.duracionPlaneadaMin} min iniciada`,
    });
    res.status(201).json(pomodoroShape(sesion));
  })
);

// GET /pomodoro/active → { data: PomodoroSession | null }
pomodoroRouter.get(
  "/active",
  asyncHandler(async (req, res) => {
    const sesion = await prisma.sesionPomodoro.findFirst({
      where: { usuarioId: req.user.id, estado: { in: ["activa", "pausada"] } },
      orderBy: { inicio: "desc" },
    });
    res.json({ data: sesion ? pomodoroShape(sesion) : null });
  })
);

// PATCH /pomodoro/:id/pause → estado pausada, acumula tiempo
pomodoroRouter.patch(
  "/:id/pause",
  asyncHandler(async (req, res) => {
    const sesion = await findSessionForUser(req.params.id, req.user);
    if (sesion.estado !== "activa") {
      throw new ApiError(400, "INVALID_STATE", "La sesión no está activa");
    }
    const now = new Date();
    const actualizada = await prisma.sesionPomodoro.update({
      where: { id: sesion.id },
      data: {
        estado: "pausada",
        tiempoAcumuladoMin: sesion.tiempoAcumuladoMin + minutosActivos(sesion, now),
        fin: now,
      },
    });
    res.json(pomodoroShape(actualizada));
  })
);

// PATCH /pomodoro/:id/resume → estado activa
pomodoroRouter.patch(
  "/:id/resume",
  asyncHandler(async (req, res) => {
    const sesion = await findSessionForUser(req.params.id, req.user);
    if (sesion.estado !== "pausada") {
      throw new ApiError(400, "INVALID_STATE", "La sesión no está pausada");
    }
    const now = new Date();
    const actualizada = await prisma.sesionPomodoro.update({
      where: { id: sesion.id },
      data: { estado: "activa", reanudadoEn: now, fin: null },
    });
    res.json(pomodoroShape(actualizada));
  })
);

// PATCH /pomodoro/:id/finish body { completada } → calcula duracionRealMin en
// servidor; si completada → actualiza MetricaDiaria y genera EventoHistorial.
pomodoroRouter.patch(
  "/:id/finish",
  validate(finishSchema),
  asyncHandler(async (req, res) => {
    const sesion = await findSessionForUser(req.params.id, req.user);
    if (sesion.estado === "completada" || sesion.estado === "cancelada") {
      throw new ApiError(400, "INVALID_STATE", "La sesión ya finalizó");
    }
    const now = new Date();
    const tiempoTotal =
      sesion.tiempoAcumuladoMin +
      (sesion.estado === "activa" ? minutosActivos(sesion, now) : 0);
    const duracionRealMin = Math.max(0, tiempoTotal);

    const actualizada = await prisma.sesionPomodoro.update({
      where: { id: sesion.id },
      data: {
        estado: req.body.completada ? "completada" : "cancelada",
        completada: req.body.completada,
        fin: now,
        duracionRealMin,
      },
    });

    if (req.body.completada) {
      await incrementarMetrica(req.user.id, fechaHoy(), {
        tiempoRealMin: duracionRealMin,
        sesionesCompletadas: 1,
      });
      await logEvent({
        usuarioId: req.user.id,
        entidadTipo: "pomodoro",
        entidadId: actualizada.id,
        accion: "completar",
        detalle: `Sesión ${actualizada.tipo} completada (${duracionRealMin} min reales de ${actualizada.duracionPlaneadaMin} planeados)`,
      });
    } else {
      await logEvent({
        usuarioId: req.user.id,
        entidadTipo: "pomodoro",
        entidadId: actualizada.id,
        accion: "cancelar",
        detalle: `Sesión cancelada tras ${duracionRealMin} min`,
      });
    }

    res.json(pomodoroShape(actualizada));
  })
);

export default pomodoroRouter;

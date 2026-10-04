import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler, notFound, assertOwnerOrAdmin } from "../utils/errors.js";
import { timeBlockShape } from "../utils/serialize.js";

export const timeblocksRouter = Router();
timeblocksRouter.use(requireAuth);

const zFecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "formato YYYY-MM-DD");
const zHora = z.string().regex(/^\d{2}:\d{2}$/, "formato HH:MM");

const listQuerySchema = z.object({
  query: z.object({ fecha: zFecha.optional() }),
});

const createSchema = z.object({
  body: z
    .object({
      tareaId: z.string().min(1),
      fecha: zFecha,
      horaInicio: zHora,
      horaFin: zHora,
    })
    .refine((b) => b.horaFin > b.horaInicio, {
      message: "horaFin debe ser posterior a horaInicio",
      path: ["horaFin"],
    }),
});

const patchSchema = z.object({
  body: z
    .object({
      tareaId: z.string().min(1).optional(),
      fecha: zFecha.optional(),
      horaInicio: zHora.optional(),
      horaFin: zHora.optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: "body vacío" }),
});

const blockInclude = { tarea: { select: { id: true, titulo: true, cuadrante: true } } };

async function findBlockForUser(id, user) {
  const bloque = notFound(
    await prisma.bloqueTiempo.findUnique({ where: { id }, include: blockInclude }),
    "Bloque de tiempo no encontrado"
  );
  assertOwnerOrAdmin(bloque, user, "Bloque de tiempo ajeno");
  return bloque;
}

// GET /timeblocks?fecha=YYYY-MM-DD → { data: TimeBlock[] }
timeblocksRouter.get(
  "/",
  validate(listQuerySchema),
  asyncHandler(async (req, res) => {
    const where = {
      ...(req.user.rol === "ADMIN" && req.query.all === "true" ? {} : { usuarioId: req.user.id }),
      ...(req.validatedQuery.fecha ? { fecha: req.validatedQuery.fecha } : {}),
    };
    const bloques = await prisma.bloqueTiempo.findMany({
      where,
      orderBy: [{ fecha: "asc" }, { horaInicio: "asc" }],
      include: blockInclude,
    });
    res.json({ data: bloques.map(timeBlockShape) });
  })
);

// POST /timeblocks → 201 TimeBlock
timeblocksRouter.post(
  "/",
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const tarea = await prisma.tarea.findUnique({ where: { id: req.body.tareaId } });
    notFound(tarea, "Tarea no encontrada");
    assertOwnerOrAdmin(tarea, req.user, "Tarea ajena");
    const bloque = await prisma.bloqueTiempo.create({
      data: { ...req.body, usuarioId: req.user.id },
      include: blockInclude,
    });
    res.status(201).json(timeBlockShape(bloque));
  })
);

// PATCH /timeblocks/:id → TimeBlock
timeblocksRouter.patch(
  "/:id",
  validate(patchSchema),
  asyncHandler(async (req, res) => {
    await findBlockForUser(req.params.id, req.user);
    const bloque = await prisma.bloqueTiempo.update({
      where: { id: req.params.id },
      data: req.body,
      include: blockInclude,
    });
    res.json(timeBlockShape(bloque));
  })
);

// DELETE /timeblocks/:id → 204
timeblocksRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await findBlockForUser(req.params.id, req.user);
    await prisma.bloqueTiempo.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

export default timeblocksRouter;

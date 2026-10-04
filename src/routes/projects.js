import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ApiError, asyncHandler, notFound, assertOwnerOrAdmin } from "../utils/errors.js";
import { projectShape } from "../utils/serialize.js";
import { logEvent } from "../services/history.js";

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

const ESTADO_PROYECTO = z.enum(["activo", "pausado", "completado", "archivado"]);

const createSchema = z.object({
  body: z.object({
    titulo: z.string().min(1).max(200),
    descripcion: z.string().max(2000).optional(),
  }),
});

const patchSchema = z.object({
  body: z
    .object({
      titulo: z.string().min(1).max(200).optional(),
      descripcion: z.string().max(2000).nullable().optional(),
      estado: ESTADO_PROYECTO.optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: "body vacío" }),
});

async function findProjectForUser(id, user) {
  const proyecto = notFound(
    await prisma.proyecto.findUnique({ where: { id } }),
    "Proyecto no encontrado"
  );
  assertOwnerOrAdmin(proyecto, user, "Proyecto ajeno");
  return proyecto;
}

// GET /projects → { data: Project[] }
projectsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const where = req.user.rol === "ADMIN" && req.query.all === "true" ? {} : { usuarioId: req.user.id };
    const proyectos = await prisma.proyecto.findMany({
      where,
      orderBy: { creadoEn: "desc" },
      include: { _count: { select: { tareas: true } } },
    });
    res.json({ data: proyectos.map(projectShape) });
  })
);

// POST /projects → 201 Project
projectsRouter.post(
  "/",
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const proyecto = await prisma.proyecto.create({
      data: { ...req.body, usuarioId: req.user.id },
    });
    await logEvent({
      usuarioId: req.user.id,
      entidadTipo: "proyecto",
      entidadId: proyecto.id,
      accion: "crear",
      detalle: `Proyecto "${proyecto.titulo}" creado`,
    });
    res.status(201).json(projectShape(proyecto));
  })
);

// GET /projects/:id → Project (403 si ajeno; ADMIN ve cualquiera)
projectsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const proyecto = await prisma.proyecto.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { tareas: true } } },
    });
    notFound(proyecto, "Proyecto no encontrado");
    assertOwnerOrAdmin(proyecto, req.user, "Proyecto ajeno");
    res.json(projectShape(proyecto));
  })
);

// PATCH /projects/:id → Project
projectsRouter.patch(
  "/:id",
  validate(patchSchema),
  asyncHandler(async (req, res) => {
    await findProjectForUser(req.params.id, req.user);
    const proyecto = await prisma.proyecto.update({
      where: { id: req.params.id },
      data: req.body,
      include: { _count: { select: { tareas: true } } },
    });
    await logEvent({
      usuarioId: req.user.id,
      entidadTipo: "proyecto",
      entidadId: proyecto.id,
      accion: "editar",
      detalle: `Proyecto editado: ${JSON.stringify(req.body)}`,
    });
    res.json(projectShape(proyecto));
  })
);

// DELETE /projects/:id → 204
projectsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const proyecto = await findProjectForUser(req.params.id, req.user);
    await prisma.proyecto.delete({ where: { id: proyecto.id } });
    await logEvent({
      usuarioId: req.user.id,
      entidadTipo: "proyecto",
      entidadId: proyecto.id,
      accion: "eliminar",
      detalle: `Proyecto "${proyecto.titulo}" eliminado`,
    });
    res.status(204).end();
  })
);

export default projectsRouter;

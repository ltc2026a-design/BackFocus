import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ApiError, asyncHandler, notFound } from "../utils/errors.js";
import { userShape, paymentShape, taskShape, historyShape } from "../utils/serialize.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

const adminUserShape = (u) => ({
  ...userShape(u),
  ...(u._count
    ? {
        _count: {
          tareas: u._count.tareas ?? 0,
          proyectos: u._count.proyectos ?? 0,
          pagos: u._count.pagos ?? 0,
        },
      }
    : {}),
});

const adminUserInclude = {
  _count: { select: { tareas: true, proyectos: true, pagos: true } },
};

const paginationSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().optional(),
    estado: z.enum(["pendiente", "completado", "fallido", "reembolsado"]).optional(),
  }),
});

const patchUserSchema = z.object({
  body: z
    .object({
      rol: z.enum(["USER", "ADMIN"]).optional(),
      nombre: z.string().min(1).max(120).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: "body vacío" }),
});

// GET /admin/stats
adminRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const [
      usuarios,
      tareas,
      tareasCompletadas,
      sesionesPomodoro,
      pagosCompletados,
      ingresos,
      proyectos,
    ] = await prisma.$transaction([
      prisma.usuario.count(),
      prisma.tarea.count(),
      prisma.tarea.count({ where: { estado: "completada" } }),
      prisma.sesionPomodoro.count(),
      prisma.pago.count({ where: { estado: "completado" } }),
      prisma.pago.aggregate({
        _sum: { monto: true },
        where: { estado: "completado" },
      }),
      prisma.proyecto.count(),
    ]);
    res.json({
      usuarios,
      tareas,
      tareasCompletadas,
      sesionesPomodoro,
      pagosCompletados,
      ingresosTotales: Math.round((ingresos._sum.monto ?? 0) * 100) / 100,
      proyectos,
    });
  })
);

// GET /admin/users?page=1&limit=20&q=
adminRouter.get(
  "/users",
  validate(paginationSchema),
  asyncHandler(async (req, res) => {
    const { page, limit, q } = req.validatedQuery;
    const where = q
      ? {
          OR: [
            { nombre: { contains: q } },
            { email: { contains: q } },
          ],
        }
      : {};
    const [total, usuarios] = await prisma.$transaction([
      prisma.usuario.count({ where }),
      prisma.usuario.findMany({
        where,
        orderBy: { creadoEn: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: adminUserInclude,
      }),
    ]);
    res.json({
      data: usuarios.map(adminUserShape),
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      total,
    });
  })
);

// PATCH /admin/users/:id (no puede degradarse a sí mismo)
adminRouter.patch(
  "/users/:id",
  validate(patchUserSchema),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id && req.body.rol && req.body.rol !== "ADMIN") {
      throw new ApiError(400, "SELF_DEMOTE", "No puedes degradarte a ti mismo");
    }
    notFound(await prisma.usuario.findUnique({ where: { id: req.params.id } }), "Usuario no encontrado");
    const usuario = await prisma.usuario.update({
      where: { id: req.params.id },
      data: req.body,
      include: adminUserInclude,
    });
    res.json(adminUserShape(usuario));
  })
);

// DELETE /admin/users/:id → 204 (no puede borrarse a sí mismo)
adminRouter.delete(
  "/users/:id",
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id) {
      throw new ApiError(400, "SELF_DELETE", "No puedes borrarte a ti mismo");
    }
    notFound(await prisma.usuario.findUnique({ where: { id: req.params.id } }), "Usuario no encontrado");
    await prisma.usuario.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

// GET /admin/payments?estado=&page=1&limit=20
adminRouter.get(
  "/payments",
  validate(paginationSchema),
  asyncHandler(async (req, res) => {
    const { page, limit, estado } = req.validatedQuery;
    const where = estado ? { estado } : {};
    const [total, pagos] = await prisma.$transaction([
      prisma.pago.count({ where }),
      prisma.pago.findMany({
        where,
        orderBy: { creadoEn: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { usuario: true },
      }),
    ]);
    res.json({
      data: pagos.map(paymentShape),
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      total,
    });
  })
);

// GET /admin/tasks?page=1&limit=20
adminRouter.get(
  "/tasks",
  validate(paginationSchema),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.validatedQuery;
    const [total, tareas] = await prisma.$transaction([
      prisma.tarea.count(),
      prisma.tarea.findMany({
        orderBy: { creadoEn: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          microTareas: { orderBy: { orden: "asc" } },
          usuario: true,
        },
      }),
    ]);
    res.json({
      data: tareas.map(taskShape),
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      total,
    });
  })
);

// GET /admin/history?page=1&limit=30
adminRouter.get(
  "/history",
  validate(paginationSchema),
  asyncHandler(async (req, res) => {
    const page = req.validatedQuery.page;
    const limit = req.query.limit ? req.validatedQuery.limit : 30;
    const [total, eventos] = await prisma.$transaction([
      prisma.eventoHistorial.count(),
      prisma.eventoHistorial.findMany({
        orderBy: { creadoEn: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { usuario: true },
      }),
    ]);
    res.json({
      data: eventos.map(historyShape),
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      total,
    });
  })
);

export default adminRouter;

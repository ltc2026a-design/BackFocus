import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/errors.js";
import { historyShape } from "../utils/serialize.js";

export const historyRouter = Router();
historyRouter.use(requireAuth);

const querySchema = z.object({
  query: z.object({
    tipo: z.string().optional(),
    from: z.string().optional(), // fecha ISO o YYYY-MM-DD
    to: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

// GET /history?tipo=&from=&to=&page=1&limit=20
historyRouter.get(
  "/",
  validate(querySchema),
  asyncHandler(async (req, res) => {
    const { tipo, from, to, page, limit } = req.validatedQuery;
    const where = {
      ...(req.user.rol === "ADMIN" && req.query.all === "true" ? {} : { usuarioId: req.user.id }),
      ...(tipo ? { entidadTipo: tipo } : {}),
      ...(from || to
        ? {
            creadoEn: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };
    const [total, eventos] = await prisma.$transaction([
      prisma.eventoHistorial.count({ where }),
      prisma.eventoHistorial.findMany({
        where,
        orderBy: { creadoEn: "desc" },
        skip: (page - 1) * limit,
        take: limit,
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

export default historyRouter;

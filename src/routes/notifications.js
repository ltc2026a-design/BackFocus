import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler, notFound, assertOwnerOrAdmin } from "../utils/errors.js";
import { notificationShape } from "../utils/serialize.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

// GET /notifications → { data: Notification[], noLeidas }
notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const where =
      req.user.rol === "ADMIN" && req.query.all === "true" ? {} : { usuarioId: req.user.id };
    const [notificaciones, noLeidas] = await prisma.$transaction([
      prisma.notificacion.findMany({ where, orderBy: { creadoEn: "desc" }, take: 200 }),
      prisma.notificacion.count({ where: { ...where, leida: false } }),
    ]);
    res.json({ data: notificaciones.map(notificationShape), noLeidas });
  })
);

// PATCH /notifications/:id/read → Notification
notificationsRouter.patch(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const notificacion = notFound(
      await prisma.notificacion.findUnique({ where: { id: req.params.id } }),
      "Notificación no encontrada"
    );
    assertOwnerOrAdmin(notificacion, req.user, "Notificación ajena");
    const actualizada = await prisma.notificacion.update({
      where: { id: notificacion.id },
      data: { leida: true },
    });
    res.json(notificationShape(actualizada));
  })
);

// POST /notifications/read-all → 204
notificationsRouter.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    await prisma.notificacion.updateMany({
      where: { usuarioId: req.user.id, leida: false },
      data: { leida: true },
    });
    res.status(204).end();
  })
);

export default notificationsRouter;

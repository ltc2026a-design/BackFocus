import express from "express";
import helmet from "helmet";
import cors from "cors";
import { ZodError } from "zod";
import { config } from "./prisma.js";
import { ApiError } from "./utils/errors.js";
import authRouter, { meRouter } from "./routes/auth.js";
import projectsRouter from "./routes/projects.js";
import tasksRouter, { subtasksRouter } from "./routes/tasks.js";
import pomodoroRouter from "./routes/pomodoro.js";
import timeblocksRouter from "./routes/timeblocks.js";
import metricsRouter from "./routes/metrics.js";
import historyRouter from "./routes/history.js";
import notificationsRouter from "./routes/notifications.js";
import exportRouter from "./routes/export.js";
import paymentsRouter from "./routes/payments.js";
import adminRouter from "./routes/admin.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins, // web (Vite/Tauri) + WebView de la app móvil
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", servicio: "focusflow-backend", ts: new Date().toISOString() });
  });

  // Rutas del contrato (todas bajo /api)
  app.use("/api/auth", authRouter); // register/login/refresh/logout
  app.use("/api", meRouter); // GET|PATCH /me
  app.use("/api/projects", projectsRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/subtasks", subtasksRouter);
  app.use("/api/pomodoro", pomodoroRouter);
  app.use("/api/timeblocks", timeblocksRouter);
  app.use("/api/metrics", metricsRouter);
  app.use("/api/history", historyRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/export", exportRouter);
  app.use("/api/payments", paymentsRouter);
  app.use("/api/admin", adminRouter);

  // 404
  app.use((req, _res, next) => {
    next(new ApiError(404, "NOT_FOUND", `Ruta no encontrada: ${req.method} ${req.originalUrl}`));
  });

  // Manejador central de errores
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof ZodError) {
      return res
        .status(400)
        .json({ error: { code: "VALIDATION_ERROR", message: err.issues[0]?.message ?? "Entrada inválida" } });
    }
    if (err instanceof ApiError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    // Errores conocidos de Prisma
    if (err?.code === "P2025") {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Recurso no encontrado" } });
    }
    if (err?.code === "P2002") {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Campo duplicado" } });
    }
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "JSON inválido" } });
    }
    console.error("[FocusFlow] Error no manejado:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Error interno del servidor" } });
  });

  return app;
}

export default createApp;

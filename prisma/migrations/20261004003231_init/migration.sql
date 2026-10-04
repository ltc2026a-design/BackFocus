-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" TEXT NOT NULL DEFAULT 'USER',
    "zonaHoraria" TEXT NOT NULL DEFAULT 'UTC',
    "temaPreferido" TEXT NOT NULL DEFAULT 'light',
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Proyecto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'activo',
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Proyecto_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tarea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "proyectoId" TEXT,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "cuadrante" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "fechaLimite" DATETIME,
    "tiempoEstimadoMin" INTEGER,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completadaEn" DATETIME,
    CONSTRAINT "Tarea_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Tarea_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MicroTarea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tareaId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "completada" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MicroTarea_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "Tarea" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SesionPomodoro" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "tareaId" TEXT,
    "inicio" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fin" DATETIME,
    "duracionPlaneadaMin" INTEGER NOT NULL,
    "duracionRealMin" INTEGER,
    "tipo" TEXT NOT NULL DEFAULT 'trabajo',
    "estado" TEXT NOT NULL DEFAULT 'activa',
    "completada" BOOLEAN NOT NULL DEFAULT false,
    "tiempoAcumuladoMin" INTEGER NOT NULL DEFAULT 0,
    "reanudadoEn" DATETIME,
    CONSTRAINT "SesionPomodoro_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SesionPomodoro_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "Tarea" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BloqueTiempo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "tareaId" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,
    CONSTRAINT "BloqueTiempo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BloqueTiempo_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "Tarea" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventoHistorial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "entidadTipo" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "detalle" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventoHistorial_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "programadaPara" DATETIME,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tareaId" TEXT,
    CONSTRAINT "Notificacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MetricaDiaria" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "tareasCompletadas" INTEGER NOT NULL DEFAULT 0,
    "tiempoEstimadoMin" INTEGER NOT NULL DEFAULT 0,
    "tiempoRealMin" INTEGER NOT NULL DEFAULT 0,
    "sesionesCompletadas" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MetricaDiaria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tipo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "precioMensual" REAL NOT NULL,
    "precioAnual" REAL,
    "descripcion" TEXT,
    "caracteristicas" TEXT NOT NULL DEFAULT '[]'
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "planTipo" TEXT NOT NULL,
    "monto" REAL NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'USD',
    "metodo" TEXT NOT NULL,
    "ciclo" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "detalleTarjeta" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Pago_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Suscripcion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "planTipo" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "desde" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hasta" DATETIME,
    CONSTRAINT "Suscripcion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiraEn" DATETIME NOT NULL,
    "revocado" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IntentoLogin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "exitoso" BOOLEAN NOT NULL,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Proyecto_usuarioId_idx" ON "Proyecto"("usuarioId");

-- CreateIndex
CREATE INDEX "Tarea_usuarioId_idx" ON "Tarea"("usuarioId");

-- CreateIndex
CREATE INDEX "Tarea_proyectoId_idx" ON "Tarea"("proyectoId");

-- CreateIndex
CREATE INDEX "MicroTarea_tareaId_idx" ON "MicroTarea"("tareaId");

-- CreateIndex
CREATE INDEX "SesionPomodoro_usuarioId_idx" ON "SesionPomodoro"("usuarioId");

-- CreateIndex
CREATE INDEX "SesionPomodoro_tareaId_idx" ON "SesionPomodoro"("tareaId");

-- CreateIndex
CREATE INDEX "BloqueTiempo_usuarioId_fecha_idx" ON "BloqueTiempo"("usuarioId", "fecha");

-- CreateIndex
CREATE INDEX "BloqueTiempo_tareaId_idx" ON "BloqueTiempo"("tareaId");

-- CreateIndex
CREATE INDEX "EventoHistorial_usuarioId_creadoEn_idx" ON "EventoHistorial"("usuarioId", "creadoEn");

-- CreateIndex
CREATE INDEX "Notificacion_usuarioId_leida_idx" ON "Notificacion"("usuarioId", "leida");

-- CreateIndex
CREATE UNIQUE INDEX "MetricaDiaria_usuarioId_fecha_key" ON "MetricaDiaria"("usuarioId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_tipo_key" ON "Plan"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "Pago_referencia_key" ON "Pago"("referencia");

-- CreateIndex
CREATE INDEX "Pago_usuarioId_idx" ON "Pago"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Suscripcion_usuarioId_key" ON "Suscripcion"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_usuarioId_idx" ON "RefreshToken"("usuarioId");

-- CreateIndex
CREATE INDEX "IntentoLogin_email_creadoEn_idx" ON "IntentoLogin"("email", "creadoEn");

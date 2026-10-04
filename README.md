# FocusFlow — Backend

API REST de la app de productividad FocusFlow. Implementa al pie de la letra el
contrato en [`docs/API_CONTRACT.md`](../docs/API_CONTRACT.md).

## Stack

- Node.js 24 + Express 4 (ESM), puerto **4000**, rutas bajo `/api`
- Prisma ORM + **SQLite** (archivo `prisma/dev.db`) — sin PostgreSQL/Docker en dev
- Auth: JWT access token (30 min) + refresh token persistido en BD con rotación
- bcryptjs para hashes de contraseña, zod para validar TODOS los inputs
- helmet, cors restringido (`http://localhost:5173`, `http://localhost:1420`),
  rate limiting en `/auth`, bloqueo temporal de login (5 fallos → 15 min, 429 `LOGIN_BLOCKED`)
- Cron simple con `setInterval` (cada 10 min) para notificaciones `deadline`

## Puesta en marcha

```bash
npm install
npx prisma migrate dev --name init   # o: npm run prisma:migrate
npx prisma db seed                   # o: npm run seed
npm run dev                          # o: npm start
```

Verificar: `curl http://localhost:4000/api/health`

## Scripts

| Script                | Descripción                                            |
| --------------------- | ------------------------------------------------------ |
| `npm run dev`         | Servidor con `node --watch`                            |
| `npm start`           | Servidor                                               |
| `npm run prisma:migrate` | `prisma migrate dev --name init`                    |
| `npm run seed`        | `prisma db seed`                                       |
| `npm run check:notifs`| Ejecuta una vez el generador de notificaciones deadline|
| `npm test`            | Tests con `node:test` + fetch nativo (puerto efímero)  |

## Credenciales seed

| Rol   | Email                | Password    |
| ----- | -------------------- | ----------- |
| ADMIN | `admin@focusflow.app`| `Admin123!` |
| USER  | `demo@focusflow.app` | `Demo123!`  |

El seed incluye: 4 planes (free $0, pro_mensual $9.99, pro_anual $99.99 con
descuento, lifetime $299 único), 2 proyectos, 11 tareas repartidas en los 4
cuadrantes (una con soft-delete) con micro-tareas, sesiones pomodoro (incluida
una activa), bloques de tiempo, `MetricaDiaria` de los últimos 30 días con
variación realista, 4 pagos de distintos estados, suscripción activa, historial
y notificaciones.

## Cambiar de SQLite a PostgreSQL

La app usa SQLite solo porque el entorno de desarrollo no tiene PostgreSQL ni
Docker. Para migrar a PostgreSQL:

1. En `prisma/schema.prisma` cambia el datasource:

   ```prisma
   datasource db {
     provider = "postgresql" // antes: "sqlite"
     url      = env("DATABASE_URL")
   }
   ```

2. En `.env` cambia `DATABASE_URL`:

   ```env
   # antes: DATABASE_URL="file:./dev.db"
   DATABASE_URL="postgresql://usuario:password@localhost:5432/focusflow?schema=public"
   ```

3. Regenera migraciones y datos:

   ```bash
   rm -rf prisma/migrations prisma/dev.db
   npx prisma migrate dev --name init
   npx prisma db seed
   ```

Nota: SQLite no soporta enums nativos de Prisma, por eso los enums del contrato
(`Quadrant`, `TaskStatus`, etc.) son `String` validados con zod en la API. Al
migrar a PostgreSQL puedes convertirlos en enums reales si lo deseas (no es
obligatorio: la API valida igual).

## Variables de entorno (`.env`)

```env
DATABASE_URL="file:./dev.db"
PORT=4000
JWT_SECRET="..."                # secreto access token (cambiar en producción)
JWT_REFRESH_SECRET="..."        # secreto refresh token
JWT_EXPIRES_IN="30m"
JWT_REFRESH_EXPIRES_DAYS=7
CORS_ORIGINS="http://localhost:5173,http://localhost:1420"
```

## Estructura

```
backend/
├── server.js                 # Arranque + cron (setInterval 10 min)
├── prisma/
│   ├── schema.prisma         # Modelo de datos (comentarios de migración a PG)
│   ├── seed.js               # Datos semilla del contrato
│   └── dev.db                # SQLite (generada)
├── scripts/check-notifs.js   # Cron manual: npm run check:notifs
├── src/
│   ├── app.js                # Express app (rutas /api, 404, error handler)
│   ├── prisma.js             # PrismaClient + config
│   ├── middleware/           # requireAuth, requireAdmin, validate (zod)
│   ├── routes/               # auth/me, projects, tasks+subtasks, pomodoro,
│   │                         # timeblocks, metrics, history, notifications,
│   │                         # export, payments, admin
│   ├── services/             # tokens (JWT+refresh), history, metrics, notifications
│   └── utils/                # ApiError/asyncHandler, serializadores del contrato
└── tests/api.test.js         # node:test + fetch (puerto efímero)
```

## Reglas de negocio clave (del contrato)

- Soft-delete de tareas: `DELETE /tasks/:id` pone `estado=eliminada`.
- `PARENT_DELETED`: no se puede completar una micro-tarea si su tarea padre está eliminada (400).
- `duracionRealMin` de pomodoro se calcula en el servidor (acumulando pausas).
- Al completar tarea/sesión se actualiza `MetricaDiaria` del día y se crea `EventoHistorial`.
- Toda creación/edición/eliminación de tareas, micro-tareas, proyectos, pomodoro y pagos genera `EventoHistorial`.
- Pagos simulados: tarjeta que empieza por `4` y 16 dígitos → `completado`; empieza por `5` → `fallido`; paypal/transferencia → `pendiente`. Solo se guardan `ultimos4` y `marca` de la tarjeta (visa/mastercard por primer dígito).
- Pago pro/lifetime completado → `Suscripcion` activa.
- Control de acceso: dueño del recurso o ADMIN; si no, 403 (`FORBIDDEN`). Admin endpoints → 403 `ADMIN_REQUIRED` sin rol ADMIN.

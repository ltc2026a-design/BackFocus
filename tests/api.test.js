// Tests de API con node:test + fetch nativo (sin jest).
// Se levanta el server en un puerto efímero. Correr con: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";

let server;
let base;
const stamp = Date.now();

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  return { status: res.status, json };
}

async function registerUser(nombre) {
  const email = `${nombre}.${stamp}@test.focusflow.local`;
  const res = await api("POST", "/auth/register", {
    body: { nombre, email, password: "Test1234!", aceptaTerminos: true },
  });
  assert.equal(res.status, 201, `register ${nombre}: ${JSON.stringify(res.json)}`);
  return { email, ...res.json };
}

before(async () => {
  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

test("flujo: register → login → crear tarea → cambiar cuadrante → verificar historial", async () => {
  // Register
  const email = `flujo.${stamp}@test.focusflow.local`;
  const reg = await api("POST", "/auth/register", {
    body: { nombre: "Usuario Flujo", email, password: "Test1234!", aceptaTerminos: true },
  });
  assert.equal(reg.status, 201);
  assert.ok(reg.json.accessToken, "register devuelve accessToken");
  assert.ok(reg.json.refreshToken, "register devuelve refreshToken");
  assert.equal(reg.json.user.email, email);
  assert.equal(reg.json.user.rol, "USER");
  assert.ok(!("passwordHash" in reg.json.user), "user nunca incluye passwordHash");

  // Login
  const login = await api("POST", "/auth/login", { body: { email, password: "Test1234!" } });
  assert.equal(login.status, 200);
  const token = login.json.accessToken;
  assert.ok(token);

  // Crear tarea
  const create = await api("POST", "/tasks", {
    token,
    body: {
      titulo: "Tarea de prueba",
      descripcion: "Creada por el test",
      cuadrante: "no_urgente_importante",
      tiempoEstimadoMin: 30,
    },
  });
  assert.equal(create.status, 201);
  assert.equal(create.json.cuadrante, "no_urgente_importante");
  assert.equal(create.json.estado, "pendiente");
  assert.deepEqual(create.json.microTareas, []);
  const taskId = create.json.id;

  // Cambiar cuadrante
  const patch = await api("PATCH", `/tasks/${taskId}`, {
    token,
    body: { cuadrante: "urgente_importante" },
  });
  assert.equal(patch.status, 200);
  assert.equal(patch.json.cuadrante, "urgente_importante");

  // Verificar historial: debe tener evento crear y cambiar_cuadrante
  const history = await api("GET", "/history?tipo=tarea&limit=50", { token });
  assert.equal(history.status, 200);
  assert.ok(Array.isArray(history.json.data));
  const eventos = history.json.data.filter((e) => e.entidadId === taskId);
  const acciones = eventos.map((e) => e.accion);
  assert.ok(acciones.includes("crear"), "historial incluye crear");
  assert.ok(acciones.includes("cambiar_cuadrante"), "historial incluye cambiar_cuadrante");
});

test("regla PARENT_DELETED: no se puede completar micro-tarea con tarea padre eliminada", async () => {
  const { accessToken: token } = await registerUser("parentdeleted");

  const create = await api("POST", "/tasks", {
    token,
    body: { titulo: "Tarea con subtarea", cuadrante: "urgente_no_importante" },
  });
  assert.equal(create.status, 201);
  const taskId = create.json.id;

  const sub = await api("POST", `/tasks/${taskId}/subtasks`, {
    token,
    body: { titulo: "Paso 1" },
  });
  assert.equal(sub.status, 201);
  assert.equal(sub.json.tareaId, taskId);
  assert.equal(sub.json.completada, false);

  // Soft-delete de la tarea → estado eliminada
  const del = await api("DELETE", `/tasks/${taskId}`, { token });
  assert.equal(del.status, 204);
  const getTask = await api("GET", `/tasks/${taskId}`, { token });
  assert.equal(getTask.json.estado, "eliminada", "delete es soft-delete (estado=eliminada)");

  // Intentar completar la micro-tarea → 400 PARENT_DELETED
  const patch = await api("PATCH", `/subtasks/${sub.json.id}`, {
    token,
    body: { completada: true },
  });
  assert.equal(patch.status, 400);
  assert.equal(patch.json.error.code, "PARENT_DELETED");
});

test("control de acceso: usuario B no puede leer la tarea del usuario A", async () => {
  const userA = await registerUser("usuarioA");
  const userB = await registerUser("usuarioB");

  const create = await api("POST", "/tasks", {
    token: userA.accessToken,
    body: { titulo: "Tarea privada de A", cuadrante: "urgente_importante" },
  });
  assert.equal(create.status, 201);
  const taskId = create.json.id;

  // A sí puede leerla
  const okA = await api("GET", `/tasks/${taskId}`, { token: userA.accessToken });
  assert.equal(okA.status, 200);

  // B no puede leerla → 403
  const forbidden = await api("GET", `/tasks/${taskId}`, { token: userB.accessToken });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.json.error.code, "FORBIDDEN");

  // B tampoco puede editarla ni borrarla
  const patchB = await api("PATCH", `/tasks/${taskId}`, {
    token: userB.accessToken,
    body: { titulo: "hack" },
  });
  assert.equal(patchB.status, 403);
  const delB = await api("DELETE", `/tasks/${taskId}`, { token: userB.accessToken });
  assert.equal(delB.status, 403);

  // Sin token → 401
  const sinToken = await api("GET", `/tasks/${taskId}`);
  assert.equal(sinToken.status, 401);
});

test("bloqueo temporal de login: 5 fallos → 429 LOGIN_BLOCKED", async () => {
  const email = `bloqueo.${stamp}@test.focusflow.local`;
  const reg = await api("POST", "/auth/register", {
    body: { nombre: "Usuario Bloqueo", email, password: "Test1234!", aceptaTerminos: true },
  });
  assert.equal(reg.status, 201);

  for (let i = 0; i < 5; i++) {
    const fallo = await api("POST", "/auth/login", { body: { email, password: "Mala12345!" } });
    assert.equal(fallo.status, 401);
    assert.equal(fallo.json.error.code, "INVALID_CREDENTIALS");
  }
  const bloqueado = await api("POST", "/auth/login", { body: { email, password: "Test1234!" } });
  assert.equal(bloqueado.status, 429, "tras 5 fallos el login queda bloqueado");
  assert.equal(bloqueado.json.error.code, "LOGIN_BLOCKED");
});

test("roles: usuario normal no entra a /admin (403 ADMIN_REQUIRED)", async () => {
  const { accessToken } = await registerUser("sinrol");
  const res = await api("GET", "/admin/stats", { token: accessToken });
  assert.equal(res.status, 403);
  assert.equal(res.json.error.code, "ADMIN_REQUIRED");
});

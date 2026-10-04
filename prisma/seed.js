// FocusFlow — Seed de desarrollo
// Usuarios semilla (según contrato):
//   ADMIN: admin@focusflow.app / Admin123!
//   USER:  demo@focusflow.app  / Demo123!
// Ejecutar con: npx prisma db seed  (o `npm run seed`)
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const dias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};
const dateToStr = (d) => d.toISOString().slice(0, 10);

async function main() {
  console.log("[seed] Limpiando datos previos...");
  // Orden importa por claves foráneas
  await prisma.intentoLogin.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.suscripcion.deleteMany();
  await prisma.pago.deleteMany();
  await prisma.notificacion.deleteMany();
  await prisma.eventoHistorial.deleteMany();
  await prisma.metricaDiaria.deleteMany();
  await prisma.bloqueTiempo.deleteMany();
  await prisma.sesionPomodoro.deleteMany();
  await prisma.microTarea.deleteMany();
  await prisma.tarea.deleteMany();
  await prisma.proyecto.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.plan.deleteMany();

  console.log("[seed] Creando planes...");
  const planFree = await prisma.plan.create({
    data: {
      tipo: "free",
      nombre: "Free",
      precioMensual: 0,
      precioAnual: 0,
      descripcion: "Todo lo esencial para organizar tu día con el método Eisenhower.",
      caracteristicas: JSON.stringify([
        "Matriz Eisenhower ilimitada",
        "Sesiones Pomodoro",
        "Métricas de los últimos 7 días",
        "1 proyecto activo",
      ]),
    },
  });
  const planProMensual = await prisma.plan.create({
    data: {
      tipo: "pro_mensual",
      nombre: "Pro Mensual",
      precioMensual: 9.99,
      precioAnual: null,
      descripcion: "Para quienes quieren exprimir FocusFlow al máximo, mes a mes.",
      caracteristicas: JSON.stringify([
        "Todo lo del plan Free",
        "Proyectos ilimitados",
        "Bloques de tiempo",
        "Métricas de 30 días y racha",
        "Exportación CSV/JSON",
        "Notificaciones de deadlines",
      ]),
    },
  });
  const planProAnual = await prisma.plan.create({
    data: {
      tipo: "pro_anual",
      nombre: "Pro Anual",
      precioMensual: 9.99,
      precioAnual: 99.99,
      descripcion: "El mismo Pro con descuento: 2 meses gratis pagando anual.",
      caracteristicas: JSON.stringify([
        "Todo lo del plan Pro",
        "2 meses gratis (ahorra ~17%)",
        "Soporte prioritario",
      ]),
    },
  });
  const planLifetime = await prisma.plan.create({
    data: {
      tipo: "lifetime",
      nombre: "Lifetime",
      precioMensual: 299,
      precioAnual: null,
      descripcion: "Pago único de $299: FocusFlow Pro para siempre.",
      caracteristicas: JSON.stringify([
        "Todo lo del plan Pro",
        "Pago único, acceso de por vida",
        "Funciones futuras incluidas",
        "Insignia Lifetime",
      ]),
    },
  });

  console.log("[seed] Creando usuarios...");
  const admin = await prisma.usuario.create({
    data: {
      nombre: "Administrador",
      email: "admin@focusflow.app",
      passwordHash: await bcrypt.hash("Admin123!", 10),
      rol: "ADMIN",
      zonaHoraria: "America/Mexico_City",
      temaPreferido: "dark",
    },
  });
  const demo = await prisma.usuario.create({
    data: {
      nombre: "Usuario Demo",
      email: "demo@focusflow.app",
      passwordHash: await bcrypt.hash("Demo123!", 10),
      rol: "USER",
      zonaHoraria: "America/Mexico_City",
      temaPreferido: "light",
    },
  });

  console.log("[seed] Creando proyectos...");
  const proyectoLanding = await prisma.proyecto.create({
    data: {
      usuarioId: demo.id,
      titulo: "Lanzamiento Landing Page",
      descripcion: "Rediseño y publicación de la landing corporativa antes de fin de mes.",
      estado: "activo",
    },
  });
  const proyectoTesis = await prisma.proyecto.create({
    data: {
      usuarioId: demo.id,
      titulo: "Tesis de Maestría",
      descripcion: "Avance del marco teórico y experimentos del capítulo 3.",
      estado: "activo",
    },
  });

  console.log("[seed] Creando tareas (4 cuadrantes)...");
  const t = (data) => prisma.tarea.create({ data: { usuarioId: demo.id, ...data } });
  const tareas = [];
  // urgente_importante
  tareas.push(await t({
    titulo: "Corregir bug del checkout",
    descripcion: "El pago con tarjeta falla al aplicar cupones en móvil.",
    cuadrante: "urgente_importante",
    estado: "en_progreso",
    fechaLimite: dias(0),
    tiempoEstimadoMin: 90,
    proyectoId: proyectoLanding.id,
  }));
  tareas.push(await t({
    titulo: "Entregar avance de capítulo 3",
    descripcion: "Enviar al asesor el borrador con los resultados preliminares.",
    cuadrante: "urgente_importante",
    estado: "pendiente",
    fechaLimite: dias(1),
    tiempoEstimadoMin: 120,
    proyectoId: proyectoTesis.id,
  }));
  tareas.push(await t({
    titulo: "Responder requerimiento del cliente",
    cuadrante: "urgente_importante",
    estado: "completada",
    fechaLimite: dias(-1),
    tiempoEstimadoMin: 45,
    proyectoId: proyectoLanding.id,
    completadaEn: dias(-1),
  }));
  // urgente_no_importante
  tareas.push(await t({
    titulo: "Reunión semanal de equipo",
    descripcion: "Sync de 30 min con diseño y desarrollo.",
    cuadrante: "urgente_no_importante",
    estado: "pendiente",
    fechaLimite: dias(0),
    tiempoEstimadoMin: 30,
  }));
  tareas.push(await t({
    titulo: "Actualizar dependencias del repo",
    cuadrante: "urgente_no_importante",
    estado: "completada",
    tiempoEstimadoMin: 40,
    proyectoId: proyectoLanding.id,
    completadaEn: dias(-2),
  }));
  // no_urgente_importante
  tareas.push(await t({
    titulo: "Diseñar arquitectura de la v2",
    descripcion: "Documento de decisión técnica (ADR) del nuevo pipeline.",
    cuadrante: "no_urgente_importante",
    estado: "en_progreso",
    fechaLimite: dias(12),
    tiempoEstimadoMin: 240,
  }));
  tareas.push(await t({
    titulo: "Curso de inglés técnico — módulo 4",
    cuadrante: "no_urgente_importante",
    estado: "pendiente",
    fechaLimite: dias(20),
    tiempoEstimadoMin: 180,
  }));
  tareas.push(await t({
    titulo: "Plan de ejercicio semanal",
    descripcion: "Rutina de 3 días con seguimiento en calendario.",
    cuadrante: "no_urgente_importante",
    estado: "pendiente",
    fechaLimite: dias(7),
    tiempoEstimadoMin: 30,
  }));
  // no_urgente_no_importante
  tareas.push(await t({
    titulo: "Limpiar bandeja de entrada",
    cuadrante: "no_urgente_no_importante",
    estado: "pendiente",
    tiempoEstimadoMin: 25,
  }));
  tareas.push(await t({
    titulo: "Organizar archivos del escritorio",
    cuadrante: "no_urgente_no_importante",
    estado: "completada",
    tiempoEstimadoMin: 20,
    completadaEn: dias(-3),
  }));
  tareas.push(await t({
    titulo: "Tarea antigua eliminada (soft-delete)",
    cuadrante: "no_urgente_no_importante",
    estado: "eliminada",
    tiempoEstimadoMin: 15,
  }));

  console.log("[seed] Creando micro-tareas...");
  const micro = async (tarea, titulo, completada = false, orden = 0) =>
    prisma.microTarea.create({ data: { tareaId: tarea.id, titulo, completada, orden } });
  await micro(tareas[0], "Reproducir el bug en entorno local", true, 0);
  await micro(tareas[0], "Escribir test que falle", true, 1);
  await micro(tareas[0], "Arreglar cálculo de cupón", false, 2);
  await micro(tareas[0], "Verificar en staging", false, 3);
  await micro(tareas[1], "Revisar comentarios del asesor", false, 0);
  await micro(tareas[1], "Exportar gráficos en alta resolución", false, 1);
  await micro(tareas[1], "Enviar PDF por correo", false, 2);
  await micro(tareas[5], "Listar opciones de arquitectura", true, 0);
  await micro(tareas[5], "Escribir ADR inicial", false, 1);
  await micro(tareas[6], "Completar lecciones 1-3", false, 0);
  await micro(tareas[6], "Practicar listening 30 min", false, 1);

  console.log("[seed] Creando sesiones pomodoro...");
  const sesion = async (data) => prisma.sesionPomodoro.create({ data: { usuarioId: demo.id, ...data } });
  for (let i = 5; i >= 1; i--) {
    const inicio = dias(-i);
    inicio.setHours(9 + (i % 3), 0, 0, 0);
    const fin = new Date(inicio.getTime() + 25 * 60 * 1000);
    await sesion({
      tareaId: tareas[i % tareas.length].id,
      inicio,
      fin,
      reanudadoEn: inicio,
      duracionPlaneadaMin: 25,
      duracionRealMin: 24 + (i % 3),
      tipo: "trabajo",
      estado: "completada",
      completada: true,
      tiempoAcumuladoMin: 24 + (i % 3),
    });
  }
  // Una sesión activa "en curso"
  await sesion({
    tareaId: tareas[0].id,
    inicio: new Date(Date.now() - 6 * 60 * 1000),
    reanudadoEn: new Date(Date.now() - 6 * 60 * 1000),
    duracionPlaneadaMin: 25,
    tipo: "trabajo",
    estado: "activa",
  });

  console.log("[seed] Creando bloques de tiempo...");
  await prisma.bloqueTiempo.create({
    data: { usuarioId: demo.id, tareaId: tareas[0].id, fecha: dateToStr(new Date()), horaInicio: "10:00", horaFin: "11:30" },
  });
  await prisma.bloqueTiempo.create({
    data: { usuarioId: demo.id, tareaId: tareas[5].id, fecha: dateToStr(dias(1)), horaInicio: "16:00", horaFin: "18:00" },
  });

  console.log("[seed] Creando métricas de los últimos 30 días...");
  for (let i = 29; i >= 0; i--) {
    const fecha = dateToStr(dias(-i));
    // Variación realista con patrón semanal: fines de semana menos productivos
    const dow = dias(-i).getDay();
    const finDeSemana = dow === 0 || dow === 6;
    const base = finDeSemana ? 1 : 3;
    const oscilacion = Math.round(2 * Math.sin(i * 1.3) + 1.5 * Math.cos(i * 0.7));
    const tareasCompletadas = Math.max(0, base + oscilacion + ((i * 7919) % 3) - 1);
    const sesionesCompletadas = Math.max(0, tareasCompletadas + ((i * 104729) % 3) - 1);
    const tiempoRealMin = sesionesCompletadas * 25 + ((i * 31) % 20);
    const tiempoEstimadoMin = tareasCompletadas * 30 + ((i * 17) % 40);
    await prisma.metricaDiaria.create({
      data: { usuarioId: demo.id, fecha, tareasCompletadas, tiempoEstimadoMin, tiempoRealMin, sesionesCompletadas },
    });
  }

  console.log("[seed] Creando pagos de ejemplo...");
  const pago = (data) => prisma.pago.create({ data: { usuarioId: demo.id, moneda: "USD", ...data } });
  const pagoCompletado = await pago({
    planTipo: "pro_mensual",
    monto: 9.99,
    metodo: "tarjeta",
    ciclo: "mensual",
    estado: "completado",
    referencia: "FF-SEED-0001",
    detalleTarjeta: JSON.stringify({ ultimos4: "1111", marca: "visa" }),
    creadoEn: dias(-20),
  });
  await pago({
    planTipo: "pro_mensual",
    monto: 9.99,
    metodo: "tarjeta",
    ciclo: "mensual",
    estado: "fallido",
    referencia: "FF-SEED-0002",
    detalleTarjeta: JSON.stringify({ ultimos4: "4444", marca: "mastercard" }),
    creadoEn: dias(-21),
  });
  await pago({
    planTipo: "pro_anual",
    monto: 99.99,
    metodo: "paypal",
    ciclo: "anual",
    estado: "pendiente",
    referencia: "FF-SEED-0003",
    creadoEn: dias(-2),
  });
  await pago({
    planTipo: "lifetime",
    monto: 299,
    metodo: "transferencia",
    ciclo: "unico",
    estado: "reembolsado",
    referencia: "FF-SEED-0004",
    creadoEn: dias(-40),
  });

  console.log("[seed] Creando suscripción activa (demo)...");
  await prisma.suscripcion.create({
    data: { usuarioId: demo.id, planTipo: "pro_mensual", activa: true, desde: dias(-20), hasta: dias(10) },
  });

  console.log("[seed] Creando historial...");
  const ev = (data) => prisma.eventoHistorial.create({ data: { usuarioId: demo.id, ...data } });
  await ev({ entidadTipo: "proyecto", entidadId: proyectoLanding.id, accion: "crear", detalle: 'Proyecto "Lanzamiento Landing Page" creado', creadoEn: dias(-25) });
  await ev({ entidadTipo: "proyecto", entidadId: proyectoTesis.id, accion: "crear", detalle: 'Proyecto "Tesis de Maestría" creado', creadoEn: dias(-24) });
  await ev({ entidadTipo: "tarea", entidadId: tareas[0].id, accion: "crear", detalle: 'Tarea "Corregir bug del checkout" creada', creadoEn: dias(-6) });
  await ev({ entidadTipo: "tarea", entidadId: tareas[0].id, accion: "cambiar_cuadrante", detalle: "Cuadrante cambiado de urgente_no_importante a urgente_importante", creadoEn: dias(-5) });
  await ev({ entidadTipo: "tarea", entidadId: tareas[2].id, accion: "completar", detalle: 'Tarea "Responder requerimiento del cliente" completada', creadoEn: dias(-1) });
  await ev({ entidadTipo: "pomodoro", entidadId: "seed", accion: "completar", detalle: "Sesión trabajo completada (25 min)", creadoEn: dias(-1) });
  await ev({ entidadTipo: "pago", entidadId: pagoCompletado.id, accion: "completar", detalle: "Pago completado de pro_mensual (mensual) por 9.99 USD vía tarjeta, ref FF-SEED-0001", creadoEn: dias(-20) });

  console.log("[seed] Creando notificaciones...");
  await prisma.notificacion.create({
    data: { usuarioId: demo.id, tipo: "payment", mensaje: "Pago completado: plan pro_mensual por 9.99 USD (ref FF-SEED-0001).", creadoEn: dias(-20) },
  });
  await prisma.notificacion.create({
    data: { usuarioId: demo.id, tipo: "info", mensaje: "¡Bienvenido a FocusFlow! Prueba la matriz Eisenhower para priorizar tu día.", leida: true, creadoEn: dias(-30) },
  });
  await prisma.notificacion.create({
    data: { usuarioId: demo.id, tipo: "deadline", mensaje: `La tarea "${tareas[1].titulo}" vence en menos de 24 horas.`, programadaPara: tareas[1].fechaLimite, tareaId: tareas[1].id, creadoEn: new Date() },
  });
  await prisma.notificacion.create({
    data: { usuarioId: demo.id, tipo: "warning", mensaje: "Tu suscripción Pro vence en 10 días.", creadoEn: dias(-1) },
  });
  await prisma.notificacion.create({
    data: { usuarioId: admin.id, tipo: "info", mensaje: "Cuenta de administrador creada. Visita /api/admin/stats.", leida: true, creadoEn: new Date() },
  });

  console.log("[seed] Listo.");
  console.log("  ADMIN: admin@focusflow.app / Admin123!");
  console.log("  USER : demo@focusflow.app / Demo123!");
  console.log(`  Planes: ${[planFree.tipo, planProMensual.tipo, planProAnual.tipo, planLifetime.tipo].join(", ")}`);
}

main()
  .catch((e) => {
    console.error("[seed] Error:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { ejecutarAgente, opcionesDe, type ResultadoEjecucion } from "./agentes.js";
import { esSensible, pedirAprobacion } from "./aprobacion.js";
import {
  Buzon,
  crearEstado,
  registrar,
  rutaEstado,
  type EstadoTarea,
  type Solicitud,
  type Trabajo,
} from "./buzon.js";
import type { Canal } from "./canal.js";
import { obtenerCanal } from "./canales/index.js";
import { buscarAgente } from "./config.js";
import fs from "node:fs";
import path from "node:path";
import { DIR_ESTADO } from "./config.js";
import { ContadorPreguntas } from "./herramientas.js";
import { asegurarRama, commitTodo, esRepo, estaLimpio } from "./git.js";
import { adquirir, liberar } from "./recursos.js";
import type { AgenteResuelto, ProyectoResuelto } from "./tipos.js";
import { registrarDecision } from "./decisiones.js";
import { verificar } from "./verificacion.js";

interface Opciones {
  descripcion: string;
  feature: string;
  agenteInicial?: string;
  /** Para reanudar una tarea aparcada */
  continuar?: {
    sesiones: Record<string, string>;
    cola: Trabajo[];
    solicitudes: number;
    mensaje: string;
    trabajo: Trabajo;
  };
}

export async function ejecutarTarea(p: ProyectoResuelto, o: Opciones): Promise<EstadoTarea> {
  const estado = crearEstado(p.nombre, o.feature, o.descripcion);
  const buzon = new Buzon();
  const sesiones = new Map<string, string>();
  const inicial = buscarAgente(p, o.agenteInicial ?? p.agentePrincipal);
  const canal = obtenerCanal(p.preguntas.canal);
  const contador = new ContadorPreguntas(p.preguntas.maxPorTarea);

  prepararRepos(p, estado, o.feature);

  const cola: Trabajo[] = o.continuar
    ? [{ ...o.continuar.trabajo, tipo: "retorno", mensaje: o.continuar.mensaje, solicitud: undefined }, ...o.continuar.cola]
    : [{ tipo: "retorno", agente: inicial.id, mensaje: promptInicial(o) }];

  if (o.continuar) {
    estado.solicitudes = o.continuar.solicitudes;
    for (const [agenteId, sid] of Object.entries(o.continuar.sesiones)) {
      sesiones.set(agenteId, sid);
      estado.sesiones[agenteId] = sid;
    }
  }
  registrar(estado, "inicio", { agenteInicial: inicial.id, ramas: estado.ramas });
  console.log(`\n▶ ${p.nombre} — tarea ${estado.tareaId} — arranca "${inicial.id}"\n`);

  const detener = (motivo: string) => {
    estado.estado = "detenida";
    estado.motivo = motivo;
    registrar(estado, "detenida", motivo);
  };

  while (cola.length > 0 && estado.estado === "en_curso") {
    const trabajo = cola.shift()!;
    const agente = buscarAgente(p, trabajo.agente);

    buzon.limpiarTurno();
    buzon.enCurso = trabajo.tipo === "solicitud" ? trabajo.solicitud : undefined;

    const prompt = trabajo.tipo === "solicitud" ? promptSolicitud(trabajo.solicitud!) : trabajo.mensaje!;
    estado.cola = [...cola];
    const r = await correrConVerificacion(p, agente, prompt, buzon, o.feature, sesiones, estado, canal, contador);

    if (buzon.preguntas.length > 0) {
      registrar(estado, "preguntas", {
        agente: agente.id,
        preguntas: buzon.preguntas.map((x) => ({ id: x.pregunta.id, pregunta: x.pregunta.pregunta, respuesta: x.respuesta })),
      });
    }

    // Pregunta sin responder: la tarea se aparca (no se sigue con el mejor criterio)
    const sinResponder = buzon.preguntas.find((x) => x.respuesta === null);
    if (sinResponder && !buzon.entrega && !buzon.completa) {
      estado.estado = "aparcada";
      estado.pendiente = { pregunta: sinResponder.pregunta, trabajo };
      estado.motivo = `Esperando respuesta a ${sinResponder.pregunta.id}`;
      registrar(estado, "aparcada", sinResponder.pregunta.id);
      break;
    }

    if (r.error && !buzon.entrega && !buzon.completa && buzon.solicitudes.length === 0) {
      detener(`El agente "${agente.id}" terminó con error: ${r.error}`);
      break;
    }

    /* 1. Solicitudes nuevas hacia otros agentes */
    for (const sol of buzon.solicitudes) {
      if (estado.solicitudes >= p.maxSolicitudes) {
        detener(`Se alcanzó el máximo de ${p.maxSolicitudes} solicitudes. Última: ${sol.id}`);
        break;
      }
      if (esSensible(p, sol) && !(await pedirAprobacion(sol, canal, p.preguntas.timeoutMin))) {
        registrar(estado, "solicitud_rechazada", sol.id);
        cola.push({
          tipo: "retorno",
          agente: sol.origen,
          mensaje:
            `Rechacé la solicitud ${sol.id}; "${sol.destino}" no la va a atender. ` +
            "Avanzá con lo que no dependa de eso, o usá tarea_completa indicando lo pendiente.",
        });
        continue;
      }
      estado.solicitudes += 1;
      registrar(estado, "solicitud", sol);
      cola.push({ tipo: "solicitud", agente: sol.destino, solicitud: sol });
    }

    /* 2. Entrega: commit y retorno al que pidió */
    if (buzon.entrega) {
      const e = buzon.entrega;
      const commit =
        p.git.commitAlCerrar && esRepo(agente.repo)
          ? commitTodo(agente.repo, `${agente.id}(${o.feature}): ${e.resumen.split("\n")[0].slice(0, 60)}`)
          : false;
      registrar(estado, "entrega", { ...e, commit });

      const origen = trabajo.solicitud?.origen;
      if (origen) cola.push({ tipo: "retorno", agente: origen, entrega: e, mensaje: promptRetorno(e, agente) });
    }

    /* 3. Bloqueo: requiere decisión tuya */
    if (buzon.bloqueo) {
      detener(`"${agente.id}" no pudo continuar: ${buzon.bloqueo}`);
      break;
    }

    /* 4. Cierre */
    if (buzon.completa) {
      if (p.git.commitAlCerrar && esRepo(agente.repo)) {
        commitTodo(agente.repo, `${agente.id}(${o.feature}): ${buzon.completa.split("\n")[0].slice(0, 60)}`);
      }
      registrar(estado, "agente_completo", { agente: agente.id, resumen: buzon.completa });
      if (agente.id === inicial.id && cola.length === 0) {
        estado.estado = "completada";
        registrar(estado, "completada", buzon.completa);
      }
    }

    if (!buzon.entrega && !buzon.completa && buzon.solicitudes.length === 0 && !buzon.bloqueo) {
      detener(`"${agente.id}" terminó sin cerrar nada (ni entrega_lista, ni tarea_completa, ni solicitar_a)`);
    }
  }

  if (estado.estado === "en_curso") {
    detener("La cola quedó vacía sin que el agente inicial marcara la tarea completa");
  }

  if (estado.estado === "aparcada") {
    console.log(`\n⏸  APARCADA — ${estado.motivo}`);
    console.log(`   Reanudá con: npm run reanudar -- -p ${p.nombre} -t ${estado.tareaId} -r "<respuesta>"\n`);
  }

  if (p.preguntas.avisarFin && estado.estado !== "aparcada") {
    await canal.avisar(
      `${estado.estado === "completada" ? "✅" : "⛔"} ${p.nombre}/${o.feature}: ${estado.estado}` +
        (estado.motivo ? `\n${estado.motivo}` : ""),
    );
  }

  imprimirResumen(estado);
  return estado;
}

/* --------------------------- verificación --------------------------- */

async function correrConVerificacion(
  p: ProyectoResuelto,
  agente: AgenteResuelto,
  prompt: string,
  buzon: Buzon,
  feature: string,
  sesiones: Map<string, string>,
  estado: EstadoTarea,
  canal: Canal,
  contador: ContadorPreguntas,
) {
  let intento = 0;
  let mensaje = prompt;

  while (true) {
    const locks = await adquirir(agente.recursos, p.nombre, agente.id, p.recursosEsperaMin);
    if (locks.length > 0) console.log(`\x1b[90m   🔒 ${agente.id}: ${agente.recursos.join(", ")}\x1b[0m`);

    let r: ResultadoEjecucion;
    try {
      r = await ejecutarAgente(
        agente.id,
        mensaje,
        opcionesDe(p, agente, buzon, feature, canal, contador, estado.tareaId, sesiones.get(agente.id)),
      );
    } finally {
      liberar(locks);
    }

    if (r.sessionId) {
      sesiones.set(agente.id, r.sessionId);
      estado.sesiones[agente.id] = r.sessionId;
    }
    estado.costoEstimadoUsd += r.costoUsd;

    const cierra = Boolean(buzon.entrega || buzon.completa);
    if (!cierra || agente.verificacion.length === 0) return r;

    const v = verificar(agente);
    if (v.ok) return r;

    intento += 1;
    registrar(estado, "verificacion_fallida", {
      agente: agente.id,
      comando: v.comando,
      reintentable: v.reintentar !== false,
      intento,
    });

    if (v.reintentar === false) {
      // Gate crítico: un verde conseguido a fuerza de reintentos no prueba nada.
      // Se detiene la tarea para que lo mire una persona.
      return {
        ...r,
        error:
          `falló una verificación que no se reintenta: "${v.comando}"` +
          (v.descripcion ? ` (${v.descripcion})` : "") +
          ". Revisala a mano antes de seguir.",
      };
    }

    if (intento >= p.maxIntentosVerificacion) {
      return { ...r, error: `falló la verificación "${v.comando}" tras ${intento} intentos` };
    }

    // Se descarta el cierre y se le devuelve el error al agente
    buzon.entrega = undefined;
    buzon.completa = undefined;
    mensaje = [
      `La verificación falló al correr: ${v.comando}`,
      "",
      "Salida:",
      v.salida ?? "(sin salida)",
      "",
      "Corregilo y volvé a cerrar (entrega_lista o tarea_completa).",
    ].join("\n");
  }
}

/* ------------------------------ prompts ------------------------------ */

const promptInicial = (o: Opciones) =>
  `Tarea (feature "${o.feature}"):\n${o.descripcion}\n\n` +
  "Si algo depende de otro agente, pedíselo con solicitar_a. Cuando tu parte esté terminada, usá tarea_completa.";

const promptSolicitud = (s: Solicitud) =>
  [
    `Solicitud ${s.id} del agente "${s.origen}" (feature "${s.feature}").`,
    "",
    `Referencias: ${s.referencias.join(", ") || "no especificadas"}`,
    "",
    "Problema reportado:",
    s.problema,
    "",
    "Lo que espera:",
    s.esperado,
    "",
    "Implementalo y cerrá con entrega_lista. Si hace falta una decisión humana, usá no_se_puede.",
  ].join("\n");

const promptRetorno = (e: { solicitudId: string; resumen: string; archivos: string[]; notas?: string }, de: AgenteResuelto) =>
  [
    `El agente "${de.id}" resolvió la solicitud ${e.solicitudId}.`,
    "",
    `Resumen: ${e.resumen}`,
    `Archivos: ${e.archivos.join(", ") || "-"}`,
    e.notas ? `Notas para vos: ${e.notas}` : "",
    "",
    "Releé lo que corresponda y continuá la tarea.",
  ]
    .filter(Boolean)
    .join("\n");

/* -------------------------------- git -------------------------------- */

function prepararRepos(p: ProyectoResuelto, estado: EstadoTarea, feature: string) {
  const repos = [...new Set(p.agentes.map((a) => a.repo))].filter(esRepo);

  for (const repo of repos) {
    if (p.git.exigirLimpio && !estaLimpio(repo) && p.git.estrategia === "rama-por-tarea") {
      throw new Error(`${repo} tiene cambios sin commitear. Limpialo o poné git.exigirLimpio: false.`);
    }
    if (p.git.estrategia === "rama-por-tarea") {
      const rama = `${p.git.prefijoRama}${feature}`;
      asegurarRama(repo, rama);
      estado.ramas[repo] = rama;
    }
  }
}

/* ------------------------------ resumen ------------------------------ */

function imprimirResumen(e: EstadoTarea) {
  console.log(`\n${e.estado === "completada" ? "✅" : "⛔"} ${e.estado.toUpperCase()} — ${e.tareaId}`);
  if (e.motivo) console.log(`   Motivo: ${e.motivo}`);
  console.log(`   Solicitudes entre agentes: ${e.solicitudes}`);
  for (const [repo, rama] of Object.entries(e.ramas)) console.log(`   ${repo} → ${rama}`);
  console.log(`   Costo estimado: US$ ${e.costoEstimadoUsd.toFixed(2)}`);
  console.log(`   Sesiones: ${Object.entries(e.sesiones).map(([a, s]) => `${a}=${s}`).join(" ") || "-"}`);
  console.log(`   Detalle: ${rutaEstado(e)}\n`);
}


/* ----------------------------- reanudar ----------------------------- */

export function cargarTarea(proyecto: string, tareaId: string): EstadoTarea {
  const archivo = path.join(DIR_ESTADO, proyecto, `${tareaId}.json`);
  if (!fs.existsSync(archivo)) throw new Error(`No existe la tarea ${tareaId} en ${proyecto}`);
  return JSON.parse(fs.readFileSync(archivo, "utf8")) as EstadoTarea;
}

/**
 * Retoma una tarea aparcada: la respuesta se registra en decisiones.md y se le
 * inyecta al agente, que continúa su sesión con todo su contexto.
 */
export async function reanudarTarea(
  p: ProyectoResuelto,
  tareaId: string,
  respuesta: string,
): Promise<EstadoTarea> {
  const previo = cargarTarea(p.nombre, tareaId);
  if (previo.estado !== "aparcada" || !previo.pendiente) {
    throw new Error(`La tarea ${tareaId} no está aparcada (estado: ${previo.estado})`);
  }

  const { pregunta, trabajo } = previo.pendiente;
  registrarDecision(p.raiz, pregunta, respuesta);

  console.log(`\n▶ Reanudando ${tareaId} con la respuesta a ${pregunta.id}\n`);

  return ejecutarTarea(p, {
    descripcion: previo.descripcion,
    feature: previo.feature,
    agenteInicial: trabajo.agente,
    continuar: {
      sesiones: previo.sesiones,
      cola: previo.cola,
      solicitudes: previo.solicitudes,
      mensaje: [
        `Retomás una tarea que quedó aparcada esperando esta respuesta.`,
        "",
        `Tu pregunta (${pregunta.id}): ${pregunta.pregunta}`,
        `Por qué la hiciste: ${pregunta.porQue}`,
        `Ya habías revisado: ${pregunta.dondeBusque.join(", ")}`,
        pregunta.recomendacion ? `Tu recomendación era: ${pregunta.recomendacion}` : "",
        "",
        `Respuesta: ${respuesta}`,
        "",
        `Quedó en decisiones.md como ${pregunta.id}; citá ese id en tu reporte.`,
        `Continuá desde donde estabas: NO rehagas el análisis que ya hiciste, aplicá la respuesta.`,
      ]
        .filter(Boolean)
        .join("\n"),
      trabajo,
    },
  });
}

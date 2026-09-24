import fs from "node:fs";
import path from "node:path";
import { DIR_PROMPTS } from "./config.js";
import { leerDecisiones } from "./decisiones.js";
import type { AgenteResuelto, ProyectoResuelto } from "./tipos.js";

export interface ResultadoEjecucion {
  sessionId?: string;
  ok: boolean;
  costoUsd: number;
  textoFinal?: string;
  error?: string;
}

/** Bloque que el orquestador genera solo, a partir del config: el agente no lo escribe. */
function bloqueCoordinacion(p: ProyectoResuelto, a: AgenteResuelto, feature: string): string {
  const otros = p.agentes.filter((x) => x.id !== a.id);
  const decisiones = leerDecisiones(p.raiz);
  const contrato = a.contrato?.requiereCambiosEn?.map((c) => c.replaceAll("{feature}", feature)) ?? [];

  return [
    `# Coordinación (proyecto "${p.nombre}", feature "${feature}")`,
    ``,
    `Sos el agente "${a.id}": ${a.descripcion}`,
    `Tu carpeta de trabajo es ${a.raiz}. No podés escribir fuera de ahí.`,
    otros.length
      ? `Otros agentes del proyecto (pedíles con solicitar_a, no hagas su trabajo):\n` +
        otros.map((o) => `- "${o.id}": ${o.descripcion} — trabaja en ${o.raiz}`).join("\n")
      : `Sos el único agente del proyecto.`,
    a.lecturaExtra.length ? `Podés leer (sin escribir): ${a.lecturaExtra.join(", ")}` : "",
    contrato.length
      ? `Para cerrar una solicitud con entrega_lista tenés que haber actualizado: ${contrato.join(", ")}`
      : "",
    a.verificacion.length
      ? `El orquestador va a correr estas verificaciones sobre tu trabajo: ${a.verificacion.map((v) => v.comando).join(" && ")}`
      : "",
    a.verificacion.some((v) => !v.reintentar)
      ? `Estas verificaciones NO se reintentan: si fallan, la tarea se detiene para revisión humana — ` +
        a.verificacion.filter((v) => !v.reintentar).map((v) => v.descripcion ?? v.comando).join("; ")
      : "",
    a.recursos.length
      ? `Recursos compartidos que tenés tomados mientras trabajás: ${a.recursos.join(", ")}. ` +
        `No los reinicies ni los borres: hay otros procesos y personas usándolos.`
      : "",
    ``,
    p.spec
      ? `## Spec\nLa especificación de esta feature está en ${p.spec.dir.replaceAll("{feature}", feature)} (requisitos, diseño y ${p.spec.archivoTareas ?? "tareas.md"}). ` +
        `Es el contrato de qué hay que hacer: leela antes de empezar y trabajá por tareas. Al cerrar una entrega citá los ids que cubriste; se validan contra el archivo. ` +
        `Si al implementar descubrís que la spec está equivocada o incompleta, NO la arregles por tu cuenta ni implementes otra cosa: eso es una decisión (preguntar o no_se_puede).`
      : "",
    `## Qué NO podés inventar`,
    `Si no lo encontrás escrito, usá preguntar (y esperá la respuesta):`,
    `1. Nombres de cosas que YA existen: tablas, columnas, enums, endpoints, claves de Redis, variables de entorno, scripts de npm. Un comando que corre con el nombre equivocado mide cero y parece una respuesta.`,
    `2. Reglas de negocio: plata, saldos, estados, documentos fiscales.`,
    `3. Cualquier cosa irreversible: borrar, resetear, migrar, transmitir, mergear.`,
    `4. Una tarea que admite dos lecturas que llevan a implementaciones distintas.`,
    `5. Alcance que crece más allá de lo que la tarea nombra: pará y avisá.`,
    `Al revés, NO preguntes por estilo, nombres internos nuevos, orden de los tests, ni por nada que se responde leyendo un archivo que tenés a mano. El campo dondeBusque exige dos lugares reales: si no podés nombrarlos, todavía no buscaste.`,
    decisiones ? `Antes de preguntar, revisá las decisiones ya tomadas: ${decisiones}` : "",
    p.preguntas.fase0
      ? `## Fase 0\nAntes de escribir una sola línea de código: leé la tarea, los docs y el código relevante, y preguntá DE UNA VEZ todo lo que no puedas resolver. Después empezá. Durante la ejecución preguntar sigue disponible, pero deja de ser lo normal.\nUna pregunta tardía cuesta más que la misma pregunta al principio: al planificar el contexto es chico, y aparcar ahí es barato; aparcar con la conversación ya crecida obliga a repagar todo el contexto al reanudar. Si vas a preguntar, preguntá temprano.`
      : "",
    ``,
    `Reglas fijas:`,
    `- No hagas commits, push ni cambios de rama: los maneja el orquestador.`,
    `- No inventes lo que hace otro agente: si falta algo de su lado, usá solicitar_a.`,
    ...p.reglasEscalada.map((r) => `- ${r}`),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Lo que se agrega al system prompt del agente: coordinación + su prompt propio. */
export function instruccionesDe(p: ProyectoResuelto, a: AgenteResuelto, feature: string): string {
  const propio = fs.readFileSync(path.join(DIR_PROMPTS, a.prompt), "utf8");
  return `${bloqueCoordinacion(p, a, feature)}\n\n${propio}`;
}

const COLORES = ["\x1b[36m", "\x1b[35m", "\x1b[32m", "\x1b[33m", "\x1b[34m", "\x1b[31m"];
const RESET = "\x1b[0m";
const colorPorAgente = new Map<string, string>();

function tag(id: string): string {
  if (!colorPorAgente.has(id)) {
    colorPorAgente.set(id, COLORES[colorPorAgente.size % COLORES.length]);
  }
  return `${colorPorAgente.get(id)}[${id}]${RESET}`;
}

/** Log por agente, con un color fijo por id. */
export function logDe(agenteId: string) {
  const t = tag(agenteId);
  return {
    texto: (texto: string) => console.log(`${t} ${texto.trim()}`),
    herramienta: (nombre: string, input: unknown) => console.log(`${t} → ${nombre} ${resumirInput(input)}`),
    error: (error: string) => console.error(`${t} ✗ ${error}`),
  };
}

function resumirInput(input: unknown): string {
  const obj = (input ?? {}) as Record<string, unknown>;
  return String(obj.file_path ?? obj.command ?? obj.pattern ?? obj.destino ?? "").slice(0, 120);
}

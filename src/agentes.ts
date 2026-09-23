import fs from "node:fs";
import path from "node:path";
import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import type { Buzon } from "./buzon.js";
import { DIR_PROMPTS } from "./config.js";
import { leerDecisiones } from "./decisiones.js";
import type { Canal } from "./canal.js";
import { HERRAMIENTAS_COORDINACION, SERVIDOR, servidorDe, type ContadorPreguntas } from "./herramientas.js";
import { guardia } from "./permisos.js";
import type { AgenteResuelto, ProyectoResuelto } from "./tipos.js";

export interface ResultadoEjecucion {
  sessionId?: string;
  ok: boolean;
  costoUsd: number;
  textoFinal?: string;
  error?: string;
}

const LECTURA = ["Read", "Glob", "Grep"];

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

export function opcionesDe(
  p: ProyectoResuelto,
  a: AgenteResuelto,
  buzon: Buzon,
  feature: string,
  canal: Canal,
  contador: ContadorPreguntas,
  tareaId: string,
  resume?: string,
): Options {
  const propio = fs.readFileSync(path.join(DIR_PROMPTS, a.prompt), "utf8");

  return {
    cwd: a.raiz,
    model: a.modelo,
    resume,
    maxTurns: p.maxTurnos,
    // Carga CLAUDE.md, .claude/rules, .claude/skills y .claude/agents desde cwd (la raíz del agente)
    settingSources: a.ajustes,
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: `${bloqueCoordinacion(p, a, feature)}\n\n${propio}`,
    },
    additionalDirectories: a.lecturaExtra,
    mcpServers: { [SERVIDOR]: servidorDe(p, a, buzon, feature, canal, contador, tareaId) },
    // Lo que está acá se aprueba solo; Write/Edit/Bash pasan por la guardia.
    allowedTools: [...LECTURA, ...HERRAMIENTAS_COORDINACION],
    canUseTool: guardia(a),
  };
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

export async function ejecutarAgente(
  agenteId: string,
  prompt: string,
  options: Options,
): Promise<ResultadoEjecucion> {
  const t = tag(agenteId);
  const resultado: ResultadoEjecucion = { ok: false, costoUsd: 0 };

  try {
    for await (const msg of query({ prompt, options })) {
      switch (msg.type) {
        case "system":
          if (msg.subtype === "init") resultado.sessionId = msg.session_id;
          break;

        case "assistant":
          for (const bloque of msg.message.content) {
            if (bloque.type === "text" && bloque.text.trim()) {
              console.log(`${t} ${bloque.text.trim()}`);
            } else if (bloque.type === "tool_use") {
              console.log(`${t} → ${bloque.name} ${resumirInput(bloque.input)}`);
            }
          }
          break;

        case "result":
          resultado.sessionId = msg.session_id;
          resultado.costoUsd = msg.total_cost_usd ?? 0;
          resultado.ok = msg.subtype === "success";
          if (msg.subtype === "success") resultado.textoFinal = msg.result;
          else resultado.error = msg.subtype;
          break;
      }
    }
  } catch (e) {
    resultado.error = e instanceof Error ? e.message : String(e);
  }

  if (resultado.error) console.error(`${t} ✗ ${resultado.error}`);
  return resultado;
}

function resumirInput(input: unknown): string {
  const obj = (input ?? {}) as Record<string, unknown>;
  return String(obj.file_path ?? obj.command ?? obj.pattern ?? obj.destino ?? "").slice(0, 120);
}

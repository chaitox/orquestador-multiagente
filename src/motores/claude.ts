/**
 * Motor: Claude Agent SDK. Es el único archivo que importa @anthropic-ai/claude-agent-sdk.
 *
 * Lo que este motor aporta y otro motor tendría que resolver:
 *
 * 1. Ejecutar al agente con herramientas propias: las de coordinación (preguntar, solicitar_a,
 *    entrega_lista, tarea_completa, no_se_puede) se exponen como un servidor MCP en proceso.
 * 2. Retomar una sesión previa (resume): el orquestador guarda el sessionId de cada agente y lo
 *    vuelve a pasar cuando lo retoma con una respuesta o una solicitud. Sin esto, cada turno
 *    empieza de cero y hay que reconstruir el contexto a mano.
 * 3. Interceptar cada llamada a herramienta ANTES de ejecutarla (canUseTool). Es lo que sostiene
 *    la guardia de permisos: escribir fuera de la raíz del agente y los comandos prohibidos se
 *    niegan acá. Si un motor no ofrece esto, la alternativa es aislar al agente en un contenedor
 *    con solo su carpeta montada.
 */
import { createSdkMcpServer, query, tool, type CanUseTool, type Options } from "@anthropic-ai/claude-agent-sdk";
import { instruccionesDe, logDe, type ResultadoEjecucion } from "../agentes.js";
import type { Buzon } from "../buzon.js";
import type { Canal } from "../canal.js";
import { herramientasDe, type ContadorPreguntas, type Herramienta } from "../herramientas.js";
import { guardia } from "../permisos.js";
import type { AgenteResuelto, ProyectoResuelto } from "../tipos.js";

const SERVIDOR = "coordinacion";
const nombreMcp = (h: string) => `mcp__${SERVIDOR}__${h}`;

const LECTURA = ["Read", "Glob", "Grep"];

function servidorMcp(herramientas: Herramienta[]) {
  return createSdkMcpServer({
    name: SERVIDOR,
    version: "1.0.0",
    tools: herramientas.map((h) => tool(h.nombre, h.descripcion, h.esquema, h.ejecutar)),
  });
}

/**
 * Se ejecuta para toda herramienta que NO esté en allowedTools.
 * Por eso Write/Edit/Bash quedan fuera de allowedTools: así siempre pasan por acá.
 */
function canUseTool(agente: AgenteResuelto): CanUseTool {
  const decidir = guardia(agente);
  return async (toolName, input) => {
    const d = await decidir(toolName, input);
    return d.permitir ? { behavior: "allow", updatedInput: input } : { behavior: "deny", message: d.mensaje };
  };
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
  const herramientas = herramientasDe(p, a, buzon, feature, canal, contador, tareaId);

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
      append: instruccionesDe(p, a, feature),
    },
    additionalDirectories: a.lecturaExtra,
    mcpServers: { [SERVIDOR]: servidorMcp(herramientas) },
    // Lo que está acá se aprueba solo; Write/Edit/Bash pasan por la guardia.
    allowedTools: [...LECTURA, ...herramientas.map((h) => nombreMcp(h.nombre))],
    canUseTool: canUseTool(a),
  };
}

export async function ejecutarAgente(
  agenteId: string,
  prompt: string,
  options: Options,
): Promise<ResultadoEjecucion> {
  const log = logDe(agenteId);
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
              log.texto(bloque.text);
            } else if (bloque.type === "tool_use") {
              log.herramienta(bloque.name, bloque.input);
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

  if (resultado.error) log.error(resultado.error);
  return resultado;
}

export { ResultadoEjecucion };

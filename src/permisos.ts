import path from "node:path";
import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import type { AgenteResuelto } from "./tipos.js";

const ESCRITURA = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

/** Comandos bloqueados para cualquier agente y cualquier stack */
export const BASH_PROHIBIDO: Array<[RegExp, string]> = [
  [/\bgit\s+(push|rebase|reset\s+--hard|checkout|switch|merge|branch\s+-D|commit)\b/, "git: las ramas y commits los maneja el orquestador"],
  [/\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/, "rm -rf"],
  [/\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b/i, "SQL destructivo"],
  [/--accept-data-loss|--force-reset|--force\b.*\bpush/, "flags destructivos"],
  [/\b(npm|pnpm|yarn)\s+publish\b|\btwine\s+upload\b/, "publicar paquetes"],
  [/\bcurl\b[^|]*\|\s*(sh|bash)\b|\bwget\b[^|]*\|\s*(sh|bash)\b/, "ejecutar scripts remotos"],
  [/\b(shutdown|reboot|mkfs|dd\s+if=)/, "comandos de sistema"],
];

function dentroDe(archivo: string, carpeta: string): boolean {
  const rel = path.relative(carpeta, archivo);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Se ejecuta para toda herramienta que NO esté en allowedTools.
 * Por eso Write/Edit/Bash quedan fuera de allowedTools: así siempre pasan por acá.
 */
export function guardia(agente: AgenteResuelto): CanUseTool {
  const prohibidos: Array<[RegExp, string]> = [
    ...BASH_PROHIBIDO,
    ...(agente.bashProhibido ?? []).map((r) => [r, "prohibido por la config del proyecto"] as [RegExp, string]),
  ];

  return async (toolName, input) => {
    if (ESCRITURA.has(toolName)) {
      const destino = String(input.file_path ?? input.notebook_path ?? "");
      const absoluto = path.resolve(agente.raiz, destino);
      if (!dentroDe(absoluto, agente.raiz)) {
        console.warn(`[${agente.id}] ✋ escritura fuera de su raíz: ${absoluto}`);
        return { behavior: "deny", message: `Solo podés escribir dentro de ${agente.raiz}.` };
      }
    }

    if (toolName === "Bash") {
      const comando = String(input.command ?? "");
      for (const [patron, motivo] of prohibidos) {
        if (patron.test(comando)) {
          console.warn(`[${agente.id}] ✋ comando bloqueado (${motivo}): ${comando}`);
          return { behavior: "deny", message: `Comando no permitido: ${motivo}.` };
        }
      }
    }

    return { behavior: "allow", updatedInput: input };
  };
}

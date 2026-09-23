import { execSync } from "node:child_process";
import type { AgenteResuelto } from "./tipos.js";

export interface ResultadoVerificacion {
  ok: boolean;
  comando?: string;
  salida?: string;
  /** false = no se le devuelve al agente para que lo arregle: se detiene para revisión humana */
  reintentar?: boolean;
  descripcion?: string;
}

/**
 * Corre los comandos del agente (flutter analyze, npm run build, pytest, etc.)
 * en su carpeta. Si uno falla, devuelve la salida para mandársela de vuelta al agente.
 */
export function verificar(agente: AgenteResuelto): ResultadoVerificacion {
  for (const v of agente.verificacion) {
    console.log(`\x1b[90m   ⚙ ${agente.id}: ${v.comando}\x1b[0m`);
    try {
      execSync(v.comando, { cwd: agente.raiz, encoding: "utf8", stdio: "pipe", timeout: 15 * 60_000 });
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      const salida = `${err.stdout ?? ""}\n${err.stderr ?? err.message ?? ""}`.trim().slice(-4000);
      console.error(`\x1b[31m   ✗ falló: ${v.comando}\x1b[0m`);
      return { ok: false, comando: v.comando, salida, reintentar: v.reintentar, descripcion: v.descripcion };
    }
  }
  return { ok: true };
}

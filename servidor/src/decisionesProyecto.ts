import fs from "node:fs";
import path from "node:path";
import { nombresConConfig } from "./nombres.js";
import { cargarProyectoResuelto } from "./proyectoConfig.js";
import { parsearDecisiones, type EntradaDecision } from "./decisiones.js";

export interface DecisionesProyecto {
  tieneConfig: boolean;
  /** null si no hay config: no hay raíz que resolver (R-05). */
  raizExiste: boolean | null;
  markdown: string;
  entradas: EntradaDecision[];
  /** Explica por qué markdown/entradas están vacíos; null si hay contenido real. */
  mensaje: string | null;
}

function mensajeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const SIN_CONFIG =
  "Este proyecto no tiene configuración: no hay raíz que resolver, así que no hay decisiones.";
const SIN_RAIZ =
  "La raíz configurada no existe en disco, así que no se puede leer decisiones.md.";
const SIN_DECISIONES = "Este proyecto todavía no tiene decisiones.md.";

/**
 * I-06 (R-05, D-3, D-8). Los cuatro casos de disco son siempre 200: sin config, raíz
 * inexistente y sin decisiones.md se informan con un mensaje, nunca con un 404 ni una
 * excepción de filesystem. La raíz sale de `cargarProyectoResuelto()` — mismo cwd fijado al
 * arrancar que usan I-02/I-03 (D-3): una `raiz: "."` se resuelve contra ese cwd, no por
 * llamada.
 */
export async function obtenerDecisionesProyecto(nombre: string): Promise<DecisionesProyecto> {
  if (!nombresConConfig().includes(nombre)) {
    return { tieneConfig: false, raizExiste: null, markdown: "", entradas: [], mensaje: SIN_CONFIG };
  }

  let raiz: string;
  try {
    const resuelto = await cargarProyectoResuelto(nombre);
    raiz = resuelto.raiz;
  } catch (e) {
    return { tieneConfig: true, raizExiste: null, markdown: "", entradas: [], mensaje: mensajeError(e) };
  }

  if (!fs.existsSync(raiz)) {
    return { tieneConfig: true, raizExiste: false, markdown: "", entradas: [], mensaje: SIN_RAIZ };
  }

  const rutaDecisiones = path.join(raiz, "decisiones.md");
  if (!fs.existsSync(rutaDecisiones)) {
    return { tieneConfig: true, raizExiste: true, markdown: "", entradas: [], mensaje: SIN_DECISIONES };
  }

  const markdown = fs.readFileSync(rutaDecisiones, "utf8");
  const { entradas } = parsearDecisiones(markdown);
  return { tieneConfig: true, raizExiste: true, markdown, entradas, mensaje: null };
}

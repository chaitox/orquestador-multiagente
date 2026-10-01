import fs from "node:fs";
import { DIR_ESTADO, DIR_PROYECTOS } from "./raices.js";

export interface ProyectoInventario {
  nombre: string;
  tieneConfig: boolean;
  tieneEstado: boolean;
}

/**
 * Misma regla que listarProyectos() en src/config.ts (basename de proyectos/*.ts|js, sin
 * extensión), reimplementada en vez de importada: esa función no toma el directorio como
 * parámetro, sino que lee DIR_PROYECTOS calculado con process.cwd() (ver raices.ts).
 */
function nombresConConfig(): string[] {
  if (!fs.existsSync(DIR_PROYECTOS)) return [];
  return fs
    .readdirSync(DIR_PROYECTOS)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".js"))
    .map((f) => f.replace(/\.(ts|js)$/, ""));
}

function nombresConEstado(): string[] {
  if (!fs.existsSync(DIR_ESTADO)) return [];
  return fs
    .readdirSync(DIR_ESTADO, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

/**
 * D-1: un proyecto existe para la interfaz si tiene proyectos/<nombre>.ts o
 * .orquestador/<nombre>/, o ambos. Esto es solo el inventario de nombres — I-02 agrega
 * encima el agregado por proyecto (cantidad de tareas, costo, agentes, última fecha).
 */
export function calcularInventario(): ProyectoInventario[] {
  const conConfig = new Set(nombresConConfig());
  const conEstado = new Set(nombresConEstado());
  const nombres = new Set<string>([...conConfig, ...conEstado]);

  return [...nombres].sort().map((nombre) => ({
    nombre,
    tieneConfig: conConfig.has(nombre),
    tieneEstado: conEstado.has(nombre),
  }));
}

import fs from "node:fs";
import { DIR_ESTADO, DIR_PROYECTOS } from "./raices.js";

/**
 * Misma regla que listarProyectos() en src/config.ts (basename de proyectos/*.ts|js, sin
 * extensión), reimplementada en vez de importada: esa función no toma el directorio como
 * parámetro, sino que lee DIR_PROYECTOS calculado con process.cwd() (ver raices.ts). Esta
 * lista de nombres, en cambio, no necesita ejecutar el archivo (a diferencia de la config
 * resuelta de I-03, que sí lo necesita y por eso vive en proyectoConfig.ts).
 */
export function nombresConConfig(): string[] {
  if (!fs.existsSync(DIR_PROYECTOS)) return [];
  return fs
    .readdirSync(DIR_PROYECTOS)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".js"))
    .map((f) => f.replace(/\.(ts|js)$/, ""));
}

export function nombresConEstado(): string[] {
  if (!fs.existsSync(DIR_ESTADO)) return [];
  return fs
    .readdirSync(DIR_ESTADO, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

/** D-1: un proyecto existe para la interfaz si tiene proyectos/<nombre>.ts o .orquestador/<nombre>/. */
export function listarNombresProyectos(): Set<string> {
  return new Set([...nombresConConfig(), ...nombresConEstado()]);
}

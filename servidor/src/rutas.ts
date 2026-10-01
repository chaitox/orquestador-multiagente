import fs from "node:fs";
import path from "node:path";

function decodificar(segmento: string): string | null {
  try {
    return decodeURIComponent(segmento);
  } catch {
    return null;
  }
}

/**
 * D-5: resuelve `:nombre` contra un inventario YA calculado (lista blanca). Compara
 * contra nombres que existen de verdad, no sanea el string — un intento de recorrido
 * (`..%2F..%2Fetc`) simplemente no está en el set y vuelve null sin tocar el filesystem.
 */
export function resolverNombreProyecto(nombres: Iterable<string>, crudo: string): string | null {
  const decodificado = decodificar(crudo);
  if (decodificado === null) return null;

  const set = nombres instanceof Set ? nombres : new Set(nombres);
  return set.has(decodificado) ? decodificado : null;
}

/**
 * D-5: resuelve `:id` contra el readdir de la carpeta de ese proyecto (ya validada por
 * resolverNombreProyecto). Defensa en profundidad: además de comparar contra el readdir,
 * confirma que la ruta absoluta resuelta siga cayendo dentro de `carpetaProyecto`.
 */
export function resolverArchivoTarea(carpetaProyecto: string, crudo: string): string | null {
  const decodificado = decodificar(crudo);
  if (decodificado === null) return null;

  let archivos: string[];
  try {
    archivos = fs.readdirSync(carpetaProyecto);
  } catch {
    return null;
  }

  const nombreArchivo = `${decodificado}.json`;
  if (!archivos.includes(nombreArchivo)) return null;

  const base = path.resolve(carpetaProyecto) + path.sep;
  const ruta = path.resolve(carpetaProyecto, nombreArchivo);
  if (!ruta.startsWith(base)) return null;

  return ruta;
}

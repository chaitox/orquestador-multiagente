import fs from "node:fs";
import path from "node:path";

export interface AgregadoTareas {
  cantidad: number;
  costoAcumuladoUsd: number;
  ultimaFecha: string | null;
}

function tieneHistorialConFecha(estado: unknown): estado is { historial: Array<{ fecha: string }> } {
  return (
    !!estado &&
    typeof estado === "object" &&
    Array.isArray((estado as { historial?: unknown }).historial) &&
    (estado as { historial: unknown[] }).historial.length > 0 &&
    typeof (estado as { historial: Array<{ fecha?: unknown }> }).historial[0]?.fecha === "string"
  );
}

/** D-4: inicio de la tarea = historial[0].fecha; si el historial está vacío, el mtime del archivo. */
function fechaInicio(estado: unknown, mtimeIso: string): string {
  return tieneHistorialConFecha(estado) ? estado.historial[0]!.fecha : mtimeIso;
}

function costoDe(estado: unknown): number {
  const c = estado && typeof estado === "object" ? (estado as { costoEstimadoUsd?: unknown }).costoEstimadoUsd : undefined;
  return typeof c === "number" && Number.isFinite(c) ? c : 0;
}

/**
 * Agregado por proyecto para I-02: cantidad de tareas, costo acumulado y fecha de la más
 * reciente. Tolerante (R-09, D-10): un archivo que no es JSON válido cuenta para la cantidad
 * pero no para el costo, y se fecha por su mtime, igual que una tarea con historial vacío.
 */
export function agregarTareas(carpetaProyecto: string): AgregadoTareas {
  let archivos: string[];
  try {
    archivos = fs.readdirSync(carpetaProyecto).filter((f) => f.endsWith(".json"));
  } catch {
    return { cantidad: 0, costoAcumuladoUsd: 0, ultimaFecha: null };
  }

  let costoTotal = 0;
  let ultima: string | null = null;

  for (const archivo of archivos) {
    const ruta = path.join(carpetaProyecto, archivo);
    const mtimeIso = fs.statSync(ruta).mtime.toISOString();

    let estado: unknown = null;
    let valido = true;
    try {
      estado = JSON.parse(fs.readFileSync(ruta, "utf8"));
    } catch {
      valido = false;
    }

    if (valido) costoTotal += costoDe(estado);
    const fecha = valido ? fechaInicio(estado, mtimeIso) : mtimeIso;
    if (ultima === null || fecha > ultima) ultima = fecha;
  }

  return {
    cantidad: archivos.length,
    // Redondeo a 4 decimales: evita arrastrar el ruido de punto flotante de sumar 41 floats.
    costoAcumuladoUsd: Math.round(costoTotal * 10000) / 10000,
    ultimaFecha: ultima,
  };
}

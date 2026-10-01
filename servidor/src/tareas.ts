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

/** D-4: fin de la tarea = historial[historial.length - 1].fecha; mismo fallback por mtime. */
function fechaFin(estado: unknown, mtimeIso: string): string {
  if (!tieneHistorialConFecha(estado)) return mtimeIso;
  const ultimo = estado.historial[estado.historial.length - 1];
  return typeof ultimo?.fecha === "string" ? ultimo.fecha : mtimeIso;
}

function campoString(estado: unknown, campo: string): string | null {
  const v = estado && typeof estado === "object" ? (estado as Record<string, unknown>)[campo] : undefined;
  return typeof v === "string" ? v : null;
}

function campoNumero(estado: unknown, campo: string): number | null {
  const v = estado && typeof estado === "object" ? (estado as Record<string, unknown>)[campo] : undefined;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function mensajeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export interface TareaResumen {
  tareaId: string;
  feature: string;
  descripcion: string;
  estado: string;
  motivo: string | null;
  costoEstimadoUsd: number;
  solicitudes: number;
  fechaInicio: string;
  fechaFin: string;
}

export interface TareaError {
  tareaId: string;
  error: string;
}

export type TareaListado = TareaResumen | TareaError;

/**
 * I-04 (R-03, R-09, D-4, D-10): lista de tareas de un proyecto, de la más reciente a la más
 * vieja por fecha de inicio. Un archivo que no es JSON válido entra como TareaError, sin
 * tumbar el resto (D-10); los campos ausentes de los JSON viejos salen con valor neutro, no
 * `undefined` (`motivo: null`, `costoEstimadoUsd`/`solicitudes`: 0).
 */
export function listarTareas(carpetaProyecto: string): TareaListado[] {
  let archivos: string[];
  try {
    archivos = fs.readdirSync(carpetaProyecto).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }

  const conOrden = archivos.map((archivo) => {
    const ruta = path.join(carpetaProyecto, archivo);
    const tareaId = archivo.slice(0, -".json".length);
    const mtimeIso = fs.statSync(ruta).mtime.toISOString();

    let estado: unknown;
    try {
      estado = JSON.parse(fs.readFileSync(ruta, "utf8"));
    } catch (e) {
      return { item: { tareaId, error: mensajeError(e) } as TareaError, orden: mtimeIso };
    }

    const inicio = fechaInicio(estado, mtimeIso);
    const item: TareaResumen = {
      tareaId,
      feature: campoString(estado, "feature") ?? "",
      descripcion: campoString(estado, "descripcion") ?? "",
      estado: campoString(estado, "estado") ?? "en_curso",
      motivo: campoString(estado, "motivo"),
      costoEstimadoUsd: campoNumero(estado, "costoEstimadoUsd") ?? 0,
      solicitudes: campoNumero(estado, "solicitudes") ?? 0,
      fechaInicio: inicio,
      fechaFin: fechaFin(estado, mtimeIso),
    };
    return { item, orden: inicio };
  });

  conOrden.sort((a, b) => (a.orden < b.orden ? 1 : a.orden > b.orden ? -1 : 0));
  return conOrden.map((x) => x.item);
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

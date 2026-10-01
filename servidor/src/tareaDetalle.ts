import fs from "node:fs";
import type { EstadoTarea, Trabajo } from "../../src/buzon.js";
import type { Pregunta } from "../../src/canal.js";

export interface TareaDetalle {
  tareaId: string;
  proyecto: string;
  feature: string;
  descripcion: string;
  estado: string;
  motivo: string | null;
  costoEstimadoUsd: number;
  solicitudes: number;
  sesiones: Record<string, string>;
  ramas: Record<string, string>;
  reposParticipantes: string[];
  pendiente: { pregunta: Pregunta; trabajo: Trabajo } | null;
  historial: Array<{ fecha: string; evento: string; detalle: unknown }>;
}

/**
 * I-05 (R-04, R-09, D-9, D-10). `rutaArchivo` ya viene resuelto por resolverArchivoTarea
 * (D-5): acá solo se lee y se tipa como Partial<EstadoTarea>. Los campos ausentes en los
 * JSON viejos (reposParticipantes, pendiente) salen con su valor neutro, nunca `undefined`
 * suelto. `pendiente` y el `detalle` de cada evento se devuelven tal cual los escribió el
 * orquestador, sin aplanar (D-10: `pendiente.pregunta` sigue anidado).
 */
export function leerDetalleTarea(rutaArchivo: string): TareaDetalle {
  const e: Partial<EstadoTarea> = JSON.parse(fs.readFileSync(rutaArchivo, "utf8"));

  return {
    tareaId: e.tareaId ?? "",
    proyecto: e.proyecto ?? "",
    feature: e.feature ?? "",
    descripcion: e.descripcion ?? "",
    estado: e.estado ?? "en_curso",
    motivo: e.motivo ?? null,
    costoEstimadoUsd: typeof e.costoEstimadoUsd === "number" ? e.costoEstimadoUsd : 0,
    solicitudes: typeof e.solicitudes === "number" ? e.solicitudes : 0,
    sesiones: e.sesiones ?? {},
    ramas: e.ramas ?? {},
    reposParticipantes: e.reposParticipantes ?? [],
    pendiente: e.pendiente ?? null,
    historial: (e.historial ?? []).map((h) => ({
      fecha: h.fecha,
      evento: h.evento,
      detalle: h.detalle ?? null,
    })),
  };
}

import fs from "node:fs";
import path from "node:path";
import { DIR_ESTADO } from "./raices.js";
import { nombresConConfig, nombresConEstado } from "./nombres.js";
import { cargarProyectoResuelto } from "./proyectoConfig.js";
import { agregarTareas } from "./tareas.js";

export interface ProyectoInventario {
  nombre: string;
  tieneConfig: boolean;
  tieneEstado: boolean;
  /** null si no hay config que resolver (sin config no hay raíz declarada) */
  raizExiste: boolean | null;
  /** Mensaje si cargar el config tiró (D-3): el proyecto igual queda en la lista. */
  errorConfig: string | null;
  /** Ids de agentes, solo si hay config resuelta (R-01: "cuando hay config"). */
  agentes: string[] | null;
  cantidadTareas: number;
  costoAcumuladoUsd: number;
  ultimaTareaFecha: string | null;
}

/**
 * D-1: un proyecto existe para la interfaz si tiene proyectos/<nombre>.ts o
 * .orquestador/<nombre>/, o ambos. I-02: además del inventario de nombres (I-01), el
 * agregado por proyecto (cantidad de tareas, costo, fecha de la última, ids de agentes) y las
 * marcas de D-3 (raizExiste, errorConfig).
 *
 * D-3: cada proyecto se carga en su propio try — uno que explota al cargar su config no tumba
 * el resto de la lista.
 */
export async function calcularInventario(): Promise<ProyectoInventario[]> {
  const conConfig = new Set(nombresConConfig());
  const conEstado = new Set(nombresConEstado());
  const nombres = [...new Set([...conConfig, ...conEstado])].sort();

  return Promise.all(
    nombres.map(async (nombre): Promise<ProyectoInventario> => {
      const tieneConfig = conConfig.has(nombre);
      const tieneEstado = conEstado.has(nombre);

      const agregado = tieneEstado
        ? agregarTareas(path.join(DIR_ESTADO, nombre))
        : { cantidad: 0, costoAcumuladoUsd: 0, ultimaFecha: null };

      let raizExiste: boolean | null = null;
      let errorConfig: string | null = null;
      let agentes: string[] | null = null;

      if (tieneConfig) {
        try {
          const resuelto = await cargarProyectoResuelto(nombre);
          raizExiste = fs.existsSync(resuelto.raiz);
          agentes = resuelto.agentes.map((a) => a.id);
        } catch (e) {
          errorConfig = e instanceof Error ? e.message : String(e);
        }
      }

      return {
        nombre,
        tieneConfig,
        tieneEstado,
        raizExiste,
        errorConfig,
        agentes,
        cantidadTareas: agregado.cantidad,
        costoAcumuladoUsd: agregado.costoAcumuladoUsd,
        ultimaTareaFecha: agregado.ultimaFecha,
      };
    }),
  );
}

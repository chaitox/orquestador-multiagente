import { nombresConConfig } from "./nombres.js";
import { cargarProyectoResuelto, mapearConfig, type ConfigDetalle } from "./proyectoConfig.js";

export interface ProyectoDetalle {
  nombre: string;
  tieneConfig: boolean;
  errorConfig: string | null;
  config: ConfigDetalle | null;
}

/**
 * I-03 (R-02, D-3, D-6). Sin config: 200 con config:null, no 404 (R-05) — "inmobiliaria" es el
 * caso real. Con config que explota al cargar (agente duplicado, agentePrincipal inexistente,
 * prompt faltante: ninguno pasa hoy con el disco real, pero D-3 lo exige igual): 200 con el
 * mensaje de error como dato en vez de tumbar el endpoint.
 */
export async function obtenerDetalleProyecto(nombre: string): Promise<ProyectoDetalle> {
  if (!nombresConConfig().includes(nombre)) {
    return { nombre, tieneConfig: false, errorConfig: null, config: null };
  }

  try {
    const resuelto = await cargarProyectoResuelto(nombre);
    return { nombre, tieneConfig: true, errorConfig: null, config: mapearConfig(resuelto) };
  } catch (e) {
    return {
      nombre,
      tieneConfig: true,
      errorConfig: e instanceof Error ? e.message : String(e),
      config: null,
    };
  }
}

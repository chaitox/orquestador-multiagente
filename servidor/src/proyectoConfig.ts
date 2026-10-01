import fs from "node:fs";
import type { AgenteResuelto, ProyectoResuelto } from "../../src/tipos.js";

type ModuloConfig = typeof import("../../src/config.js");

let moduloPromesa: Promise<ModuloConfig> | undefined;

/**
 * src/config.ts calcula RAIZ_APP = process.cwd() al importarse, y resuelve rutas relativas
 * del config (ej. `raiz: "."`) contra process.cwd() en cada llamada a resolver() — no solo al
 * importarse. Por eso el cwd correcto (raíz del repo) tiene que estar puesto *antes* de
 * importar este módulo y seguir así mientras el servidor corra: lo hace src/index.ts una sola
 * vez al arrancar, antes de levantar el servidor. Acá no se vuelve a tocar el cwd — hacerlo
 * por llamada no es seguro con requests concurrentes (cwd es estado global del proceso).
 */
function obtenerModulo(): Promise<ModuloConfig> {
  if (!moduloPromesa) {
    moduloPromesa = import("../../src/config.js");
  }
  return moduloPromesa;
}

/**
 * D-3: se carga con exigirRaices:false (una raíz de agente que no existe no tira) y el
 * llamador decide qué hacer con el resto de los errores posibles (agente duplicado,
 * agentePrincipal inexistente, prompt faltante): acá no se atrapan, para que cada punto de
 * entrada (inventario, detalle) los muestre como "error de config" en su propio try.
 */
export async function cargarProyectoResuelto(nombre: string): Promise<ProyectoResuelto> {
  const { cargarProyecto } = await obtenerModulo();
  return cargarProyecto(nombre, { exigirRaices: false });
}

export interface AgenteDetalle {
  id: string;
  descripcion: string;
  carpeta: string;
  repo: string;
  modelo: string;
  lecturaExtra: string[];
  verificacion: Array<{ comando: string; reintentar: boolean; descripcion?: string }>;
  recursos: string[];
  contrato: AgenteResuelto["contrato"] | null;
}

export interface ConfigDetalle {
  raiz: string;
  raizExiste: boolean;
  modeloPorDefecto: string;
  maxSolicitudes: number;
  maxTurnos: number;
  maxIntentosVerificacion: number;
  git: { estrategia: string; prefijoRama: string; commitAlCerrar: boolean; exigirLimpio: boolean };
  preguntas: { canal: string; timeoutMin: number; maxPorTarea: number; avisarFin: boolean; fase0: boolean };
  specDriven: boolean;
  spec: { dir: string; archivoTareas: string; agente: string | null } | null;
  agentes: AgenteDetalle[];
}

/**
 * No incluye `sensibles` (proyecto) ni `bashProhibido` (agente): son los dos campos RegExp del
 * config (ver ejemplo-pedidos.ts y ejemplo-python-react.ts) y R-02 no los pide. Rama elegida
 * de la regla transversal de diseño.md ("se serializa como string... o no se expone"): acá no
 * se exponen.
 */
function mapearAgente(a: AgenteResuelto): AgenteDetalle {
  return {
    id: a.id,
    descripcion: a.descripcion,
    carpeta: a.raiz,
    repo: a.repo,
    modelo: a.modelo,
    lecturaExtra: a.lecturaExtra,
    verificacion: a.verificacion,
    recursos: a.recursos,
    contrato: a.contrato ?? null,
  };
}

export function mapearConfig(p: ProyectoResuelto): ConfigDetalle {
  return {
    raiz: p.raiz,
    raizExiste: fs.existsSync(p.raiz),
    modeloPorDefecto: p.modeloPorDefecto,
    maxSolicitudes: p.maxSolicitudes,
    maxTurnos: p.maxTurnos,
    maxIntentosVerificacion: p.maxIntentosVerificacion,
    git: {
      estrategia: p.git.estrategia,
      prefijoRama: p.git.prefijoRama,
      commitAlCerrar: p.git.commitAlCerrar,
      exigirLimpio: p.git.exigirLimpio,
    },
    preguntas: {
      canal: p.preguntas.canal,
      timeoutMin: p.preguntas.timeoutMin,
      maxPorTarea: p.preguntas.maxPorTarea,
      avisarFin: p.preguntas.avisarFin,
      fase0: p.preguntas.fase0,
    },
    specDriven: p.spec !== undefined,
    spec: p.spec
      ? { dir: p.spec.dir, archivoTareas: p.spec.archivoTareas ?? "tareas.md", agente: p.spec.agente ?? null }
      : null,
    agentes: p.agentes.map(mapearAgente),
  };
}

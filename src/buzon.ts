import fs from "node:fs";
import path from "node:path";
import type { Pregunta } from "./canal.js";
import { DIR_ESTADO } from "./config.js";

export interface Solicitud {
  id: string;
  origen: string;
  destino: string;
  feature: string;
  problema: string;
  esperado: string;
  referencias: string[];
  creada: string;
}

export interface Entrega {
  solicitudId: string;
  agente: string;
  resumen: string;
  archivos: string[];
  notas?: string;
  /** Ids de tareas de la spec que cubre la entrega */
  tareas?: string[];
}

/** Canal que llenan las herramientas MCP durante el turno de un agente. */
export class Buzon {
  solicitudes: Solicitud[] = [];
  entrega?: Entrega;
  bloqueo?: string;
  completa?: string;
  /** Solicitud que el agente en curso está atendiendo (para validar su cierre). */
  enCurso?: Solicitud;
  /** Preguntas hechas al humano durante el turno, con su respuesta */
  preguntas: Array<{ pregunta: Pregunta; respuesta: string | null }> = [];
  private n = 0;

  nuevoId(origen: string, destino: string) {
    this.n += 1;
    return `${origen}->${destino}#${this.n}`;
  }

  limpiarTurno() {
    this.solicitudes = [];
    this.preguntas = [];
    this.entrega = undefined;
    this.bloqueo = undefined;
    this.completa = undefined;
  }
}

export interface Trabajo {
  tipo: "solicitud" | "retorno";
  agente: string;
  solicitud?: Solicitud;
  entrega?: Entrega;
  mensaje?: string;
}

export type EstadoGeneral = "en_curso" | "completada" | "detenida" | "aparcada";

export interface EstadoTarea {
  tareaId: string;
  proyecto: string;
  feature: string;
  descripcion: string;
  estado: EstadoGeneral;
  motivo?: string;
  solicitudes: number;
  costoEstimadoUsd: number;
  sesiones: Record<string, string>;
  /** Cola pendiente, para poder reanudar una tarea aparcada */
  cola: Trabajo[];
  /** Pregunta sin responder que dejó la tarea aparcada */
  pendiente?: { pregunta: Pregunta; trabajo: Trabajo };
  ramas: Record<string, string>;
  historial: Array<{ fecha: string; evento: string; detalle?: unknown }>;
}

export function crearEstado(proyecto: string, feature: string, descripcion: string): EstadoTarea {
  return {
    tareaId: `${feature}-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    proyecto,
    feature,
    descripcion,
    estado: "en_curso",
    solicitudes: 0,
    costoEstimadoUsd: 0,
    sesiones: {},
    cola: [],
    ramas: {},
    historial: [],
  };
}

export function registrar(e: EstadoTarea, evento: string, detalle?: unknown) {
  e.historial.push({ fecha: new Date().toISOString(), evento, detalle });
  guardarEstado(e);
}

export function guardarEstado(e: EstadoTarea) {
  const dir = path.join(DIR_ESTADO, e.proyecto);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${e.tareaId}.json`), JSON.stringify(e, null, 2));
}

export const rutaEstado = (e: EstadoTarea) =>
  path.relative(process.cwd(), path.join(DIR_ESTADO, e.proyecto, `${e.tareaId}.json`));

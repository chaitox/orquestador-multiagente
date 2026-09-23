import fs from "node:fs";
import path from "node:path";
import type { Pregunta } from "./canal.js";

/**
 * Toda respuesta se escribe en decisiones.md del proyecto y se le devuelve al agente
 * citada con su id. Si vive solo en Telegram, el próximo agente pregunta lo mismo.
 */
export function registrarDecision(raizProyecto: string, p: Pregunta, respuesta: string): string {
  const archivo = path.join(raizProyecto, "decisiones.md");
  const fecha = new Date().toISOString().slice(0, 10);

  if (!fs.existsSync(archivo)) {
    fs.writeFileSync(
      archivo,
      "# Decisiones\n\nRespuestas a preguntas de los agentes. Cada una tiene id y fecha,\n" +
      "y se cita en los reportes. Lo que no está acá, no pasó.\n",
    );
  }

  const bloque = [
    "",
    `## ${p.id} — ${fecha}`,
    "",
    `**Pregunta** (${p.agente}, tarea ${p.tarea}): ${p.pregunta}`,
    "",
    `**Respuesta:** ${respuesta}`,
    "",
    `<sub>Bloqueaba: ${p.porQue} · Buscó en: ${p.dondeBusque.join(", ")}</sub>`,
    "",
  ].join("\n");

  fs.appendFileSync(archivo, bloque);
  return p.id;
}

/**
 * Siguiente id libre para una feature, leído del propio decisiones.md.
 * Antes el id salía del nombre de la tarea recortado, y como el recorte caía dentro del
 * nombre de la feature, dos corridas de la misma feature generaban ids repetidos.
 */
export function siguienteIdDecision(raizProyecto: string, feature: string): string {
  const archivo = path.join(raizProyecto, "decisiones.md");
  const prefijo = `DEC-${feature}-`;
  let maximo = 0;

  if (fs.existsSync(archivo)) {
    const contenido = fs.readFileSync(archivo, "utf8");
    const re = new RegExp(`${prefijo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)`, "g");
    for (const m of contenido.matchAll(re)) maximo = Math.max(maximo, Number(m[1]));
  }
  return `${prefijo}${String(maximo + 1).padStart(2, "0")}`;
}

/** Decisiones ya registradas, para que el agente las lea antes de preguntar */
export function leerDecisiones(raizProyecto: string): string | null {
  const archivo = path.join(raizProyecto, "decisiones.md");
  return fs.existsSync(archivo) ? archivo : null;
}
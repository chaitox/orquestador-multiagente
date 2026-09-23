import fs from "node:fs";
import path from "node:path";

/* ------------------------- dondeBusque ------------------------- */

export interface ResultadoValidacion {
  ok: boolean;
  validas: string[];
  invalidas: string[];
}

/**
 * Un campo de texto libre se satisface de mentira en dos segundos: el modelo escribe
 * dos rutas plausibles sin haber abierto ninguna. Acá cada entrada tiene que ser una
 * ruta que EXISTE, dentro de la carpeta del agente, de sus lecturas extra o del proyecto.
 */
export function validarDondeBusque(
  entradas: string[],
  raizAgente: string,
  lecturaExtra: string[],
  raizProyecto: string,
): ResultadoValidacion {
  const bases = [raizAgente, ...lecturaExtra, raizProyecto];
  const validas: string[] = [];
  const invalidas: string[] = [];

  for (const entrada of entradas) {
    // Tolerante con lo que escriben los modelos: toma el primer token, saca comillas,
    // comentarios ("ruta (vacío)", "ruta # nota") y referencias de línea ("ruta:120").
    const limpia = entrada
      .trim()
      .replace(/^[`'"]+|[`'"]+$/g, "")
      .split(/[\s(]/)[0]
      .split("#")[0]
      .replace(/[,;.]+$/, "")
      .replace(/:\d+(-\d+)?$/, "")
      .trim();
    if (!limpia) {
      invalidas.push(entrada);
      continue;
    }

    const existe = bases.some((base) => {
      const abs = path.isAbsolute(limpia) ? limpia : path.resolve(base, limpia);
      return dentroDe(abs, base) && fs.existsSync(abs);
    });

    (existe ? validas : invalidas).push(entrada);
  }

  return { ok: invalidas.length === 0 && validas.length >= 2, validas, invalidas };
}

function dentroDe(objetivo: string, base: string): boolean {
  const rel = path.relative(base, objetivo);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/* ------------------------- decisiones.md ------------------------- */

export interface DecisionParecida {
  id: string;
  pregunta: string;
  respuesta: string;
  puntaje: number;
}

const VACIAS = new Set([
  "para", "porque", "como", "cual", "cuales", "donde", "cuando", "esta", "este", "esto", "esos",
  "with", "the", "and", "que", "los", "las", "del", "con", "por", "una", "uno", "sobre", "hay",
  "debe", "puede", "hace", "tiene", "ser", "son", "está", "qué", "cómo", "dónde", "cuándo", "si",
  "no", "se", "de", "en", "el", "la", "un", "al", "lo", "es", "va", "y", "o", "a",
]);

const tokenizar = (t: string): Set<string> =>
  new Set(
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9_]+/)
      .filter((w) => w.length > 2 && !VACIAS.has(w)),
  );

/**
 * Antes de molestar a un humano, se busca si la pregunta ya fue respondida.
 * Match por palabras: alcanza para atrapar las repetidas, que son la mayoría.
 */
export function buscarDecisionParecida(
  raizProyecto: string,
  pregunta: string,
  umbral = 0.5,
): DecisionParecida | null {
  const archivo = path.join(raizProyecto, "decisiones.md");
  if (!fs.existsSync(archivo)) return null;

  const contenido = fs.readFileSync(archivo, "utf8");
  const tokensNuevos = tokenizar(pregunta);
  if (tokensNuevos.size < 3) return null;

  let mejor: DecisionParecida | null = null;

  for (const bloque of contenido.split(/^## /m).slice(1)) {
    const id = bloque.split(/\s|—|\n/)[0]?.trim();
    const preguntaPrevia = /\*\*Pregunta\*\*[^:]*:\s*([\s\S]*?)(?:\n\n|\*\*Respuesta)/.exec(bloque)?.[1]?.trim();
    const respuesta = /\*\*Respuesta:\*\*\s*([\s\S]*?)(?:\n\n|<sub>|$)/.exec(bloque)?.[1]?.trim();
    if (!id || !preguntaPrevia || !respuesta) continue;

    const tokensPrevios = tokenizar(preguntaPrevia);
    const comunes = [...tokensNuevos].filter((t) => tokensPrevios.has(t));
    const puntaje = comunes.length / tokensNuevos.size;

    if (comunes.length >= 3 && puntaje >= umbral && (!mejor || puntaje > mejor.puntaje)) {
      mejor = { id, pregunta: preguntaPrevia, respuesta, puntaje };
    }
  }

  return mejor;
}

/* ------------------------- spec: ids de tarea ------------------------- */

export interface ResultadoTareas {
  ok: boolean;
  validos: string[];
  invalidos: string[];
  disponibles: string[];
}

/**
 * Los ids citados en una entrega tienen que existir en tareas.md de la spec.
 * Mismo criterio que dondeBusque: un id inventado es tan barato de escribir como
 * una ruta inventada, así que se valida contra el archivo real.
 * Reconoce "T-01", "- [ ] T-01 ...", "## T-01 — ..." y variantes.
 */
export function validarIdsTarea(archivoTareas: string, ids: string[]): ResultadoTareas {
  if (!fs.existsSync(archivoTareas)) {
    return { ok: false, validos: [], invalidos: ids, disponibles: [] };
  }
  const contenido = fs.readFileSync(archivoTareas, "utf8");
  const disponibles = [...new Set(contenido.match(/\b[A-Z]{1,4}-\d{1,3}\b/g) ?? [])];

  const validos: string[] = [];
  const invalidos: string[] = [];
  for (const id of ids) (disponibles.includes(id.trim()) ? validos : invalidos).push(id);

  return { ok: ids.length > 0 && invalidos.length === 0, validos, invalidos, disponibles };
}
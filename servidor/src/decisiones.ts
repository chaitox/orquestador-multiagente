export interface EntradaDecision {
  id: string;
  encabezado: string;
  fecha: string | null;
  agente: string | null;
  tarea: string | null;
  pregunta: string | null;
  respuesta: string | null;
}

export interface Decisiones {
  markdown: string;
  entradas: EntradaDecision[];
}

const RE_FECHA = /[-—]\s*(\d{4}-\d{2}-\d{2})\s*$/;
const RE_PREGUNTA = /\*\*Pregunta\*\*\s*\(([^,]+),\s*tarea\s+([^)]+)\)\s*:\s*(.+)/;
const RE_RESPUESTA = /\*\*Respuesta:\*\*\s*([\s\S]*?)(?=\n##\s|\n<sub>|$)/;

/**
 * D-8: parseo tolerante. Toda sección `## ` es una entrada; su id es el primer token del
 * encabezado, y los campos que matcheen el formato de src/decisiones.ts se extraen — los
 * que no, quedan en null. El markdown crudo se devuelve completo siempre, aunque el índice
 * no logre extraer un solo campo de una sección.
 */
export function parsearDecisiones(markdown: string): Decisiones {
  const lineas = markdown.split("\n");
  const inicios: number[] = [];
  lineas.forEach((linea, i) => {
    if (linea.startsWith("## ")) inicios.push(i);
  });

  const entradas: EntradaDecision[] = inicios.map((inicio, idx) => {
    const fin = idx + 1 < inicios.length ? inicios[idx + 1]! : lineas.length;
    const encabezado = lineas[inicio]!.slice(3).trim();
    const cuerpo = lineas.slice(inicio + 1, fin).join("\n");

    const id = encabezado.split(/\s+/)[0] ?? "";
    const fechaMatch = encabezado.match(RE_FECHA);
    const preguntaMatch = cuerpo.match(RE_PREGUNTA);
    const respuestaMatch = cuerpo.match(RE_RESPUESTA);

    return {
      id,
      encabezado,
      fecha: fechaMatch?.[1] ?? null,
      agente: preguntaMatch?.[1]?.trim() ?? null,
      tarea: preguntaMatch?.[2]?.trim() ?? null,
      pregunta: preguntaMatch?.[3]?.trim() ?? null,
      respuesta: respuestaMatch?.[1]?.trim() ?? null,
    };
  });

  return { markdown, entradas };
}

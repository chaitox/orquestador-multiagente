export interface Pregunta {
  id: string;
  agente: string;
  repo: string;
  tarea: string;
  feature: string;
  pregunta: string;
  /** Qué se bloquea sin esto */
  porQue: string;
  /** Lugares reales donde buscó antes de preguntar (mínimo 2) */
  dondeBusque: string[];
  /** Si es cerrada: 2 a 4 opciones → botones */
  opciones?: string[];
  /** Lo que haría el agente. Se muestra, NO se ejecuta sola. */
  recomendacion?: string;
}

export interface Canal {
  nombre: string;
  /** Bloquea hasta la respuesta. null = venció el tiempo de espera. */
  preguntar(p: Pregunta, timeoutMin: number): Promise<string | null>;
  confirmar(texto: string, timeoutMin: number): Promise<boolean | null>;
  avisar(texto: string, agente?: string): Promise<void>;
}

export function formatearPregunta(p: Pregunta): string {
  return [
    `❓ ${p.id} · ${p.agente} · ${p.repo}`,
    `tarea: ${p.tarea}`,
    "",
    p.pregunta,
    "",
    `Se bloquea: ${p.porQue}`,
    `Buscó en: ${p.dondeBusque.join(", ")}`,
    p.recomendacion ? `Recomienda (no lo ejecuta solo): ${p.recomendacion}` : "",
    // Con 4 o menos van como botones; si son más, se listan
    p.opciones && p.opciones.length > 4
      ? `Opciones: ${p.opciones.map((o, i) => `${i + 1}) ${o}`).join("  ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

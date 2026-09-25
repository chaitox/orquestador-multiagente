import type { Canal } from "./canal.js";
import type { Solicitud } from "./buzon.js";
import type { ProyectoResuelto } from "./tipos.js";

export function esSensible(p: ProyectoResuelto, sol: Solicitud): boolean {
  const texto = `${sol.problema} ${sol.esperado} ${sol.referencias.join(" ")}`;
  return p.sensibles.some((re) => re.test(texto));
}

export async function pedirAprobacion(sol: Solicitud, canal: Canal, timeoutMin: number): Promise<boolean> {
  const texto = [
    `⚠ Solicitud sensible de "${sol.origen}" para "${sol.destino}" (${sol.id})`,
    "",
    `Referencias: ${sol.referencias.join(", ") || "-"}`,
    `Problema: ${sol.problema}`,
    `Esperado: ${sol.esperado}`,
    "",
    `¿Autorizás que "${sol.destino}" la ejecute?`,
  ].join("\n");

  const r = await canal.confirmar(texto, timeoutMin);
  return r === true; // sin respuesta = no
}

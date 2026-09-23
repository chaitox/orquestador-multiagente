/**
 * Glob mínimo: soporta ** (cualquier profundidad), * (un segmento) y {feature}.
 * Alcanza para validar rutas de contrato como "docs/{feature}/**" u "openapi.yaml".
 */
export function coincide(ruta: string, patron: string, feature: string): boolean {
  const normalizada = ruta.replace(/\\/g, "/");
  const expandido = patron.replaceAll("{feature}", feature).replace(/\\/g, "/");

  const regex = expandido
    .split("/")
    .map((seg) => {
      if (seg === "**") return "(?:.+)";
      return seg
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, "[^/]*");
    })
    .join("/")
    .replace(/\/\(\?:\.\+\)$/, "(?:/.+)?"); // "a/**" también matchea "a"

  return new RegExp(`^${regex}$`).test(normalizada);
}

export function algunaCoincide(rutas: string[], patrones: string[], feature: string): string[] {
  return rutas.filter((r) => patrones.some((p) => coincide(r, p, feature)));
}

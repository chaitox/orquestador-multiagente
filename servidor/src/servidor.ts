import http from "node:http";
import { calcularInventario } from "./inventario.js";
import { resolverNombreProyecto } from "./rutas.js";

const RUTA_PROYECTO = /^\/api\/proyectos\/([^/]+)$/;

function responderJSON(
  res: http.ServerResponse,
  status: number,
  cuerpo: unknown,
  headers: Record<string, string> = {},
) {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(texto);
}

export function crearServidor(): http.Server {
  return http.createServer((req, res) => {
    const metodo = req.method ?? "GET";

    // Solo lectura (R-06, R-08): cualquier verbo que no sea GET, 405 sin mirar la ruta.
    if (metodo !== "GET") {
      responderJSON(
        res,
        405,
        { error: `Método no permitido: ${metodo}. Este servidor es de solo lectura (GET).` },
        { Allow: "GET" },
      );
      return;
    }

    const url = new URL(req.url ?? "/", "http://localhost");
    const ruta = url.pathname;

    if (ruta === "/api/proyectos") {
      responderJSON(res, 200, calcularInventario());
      return;
    }

    const coincide = ruta.match(RUTA_PROYECTO);
    if (coincide) {
      const inventario = calcularInventario();
      const nombre = resolverNombreProyecto(
        inventario.map((p) => p.nombre),
        coincide[1]!,
      );
      if (nombre === null) {
        responderJSON(res, 404, { error: `No se encontró el proyecto "${coincide[1]}"` });
        return;
      }
      const proyecto = inventario.find((p) => p.nombre === nombre);
      responderJSON(res, 200, proyecto);
      return;
    }

    responderJSON(res, 404, { error: `No se encontró la ruta ${ruta}` });
  });
}

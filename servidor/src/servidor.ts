import http from "node:http";
import { calcularInventario } from "./inventario.js";
import { obtenerDetalleProyecto } from "./detalle.js";
import { listarNombresProyectos } from "./nombres.js";
import { resolverNombreProyecto } from "./rutas.js";

const RUTA_PROYECTO = /^\/api\/proyectos\/([^/]+)$/;

function mensajeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

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
      calcularInventario()
        .then((inventario) => responderJSON(res, 200, inventario))
        .catch((e) => responderJSON(res, 500, { error: mensajeError(e) }));
      return;
    }

    const coincide = ruta.match(RUTA_PROYECTO);
    if (coincide) {
      const nombre = resolverNombreProyecto(listarNombresProyectos(), coincide[1]!);
      if (nombre === null) {
        responderJSON(res, 404, { error: `No se encontró el proyecto "${coincide[1]}"` });
        return;
      }
      obtenerDetalleProyecto(nombre)
        .then((detalle) => responderJSON(res, 200, detalle))
        .catch((e) => responderJSON(res, 500, { error: mensajeError(e) }));
      return;
    }

    responderJSON(res, 404, { error: `No se encontró la ruta ${ruta}` });
  });
}

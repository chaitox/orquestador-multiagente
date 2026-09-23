import { formatearPregunta, type Canal, type Pregunta } from "../canal.js";

const FIN = ".";

/**
 * Lectura directa de process.stdin, SIN readline.
 *
 * Por qué: readline administra el terminal (eco, edición de línea) y con un pegado
 * grande mientras el proceso imprime, la entrada y la salida se mezclan — medido:
 * respuestas de 900 caracteres guardadas con 112, y salida del propio orquestador
 * ("⏸ spec pregunta...") incrustada dentro de la respuesta del usuario.
 *
 * Acá el terminal sigue en modo canónico (el driver del tty hace el eco y arma las
 * líneas) y nosotros solo consumimos el stream. Nada que se pegue se pierde.
 */
let iniciado = false;
let pendiente = "";
let consumidor: ((linea: string) => void) | null = null;

function iniciar() {
  if (iniciado) return;
  iniciado = true;
  process.stdin.setEncoding("utf8");
  process.stdin.resume();
  process.stdin.on("data", (trozo: string) => {
    pendiente += trozo;
    let corte: number;
    while ((corte = pendiente.indexOf("\n")) >= 0) {
      const linea = pendiente.slice(0, corte).replace(/\r$/, "");
      pendiente = pendiente.slice(corte + 1);
      consumidor?.(linea);
    }
  });
}

function leerTexto(encabezado: string, timeoutMin: number): Promise<string | null> {
  iniciar();
  console.log(encabezado);

  return new Promise((resolve) => {
    const lineas: string[] = [];

    const terminar = (porTiempo: boolean) => {
      clearTimeout(timer);
      consumidor = null;
      const texto = lineas.join("\n").trim();
      resolve(porTiempo || texto === "" ? null : texto);
    };

    const timer = setTimeout(() => terminar(true), timeoutMin * 60_000);

    consumidor = (linea: string) => {
      if (linea.trim() === FIN) terminar(false);
      else lineas.push(linea);
    };
  });
}

export const canalConsola: Canal = {
  nombre: "consola",

  async preguntar(p: Pregunta, timeoutMin: number) {
    console.log(`\n\x1b[33m${formatearPregunta(p)}\x1b[0m`);
    return leerTexto(
      `\nRespuesta (podés pegar varias líneas de una vez).\n` +
      `Terminá con una línea que contenga solo un punto:  .\n` +
      `Vacío = no sé, que use no_se_puede.`,
      timeoutMin,
    );
  },

  async confirmar(texto: string, timeoutMin: number) {
    const r = await leerTexto(`\n\x1b[33m${texto}\x1b[0m\nRespondé s o n, y después un punto en línea aparte:`, timeoutMin);
    return r === null ? null : r.trim().toLowerCase().startsWith("s");
  },

  async avisar(texto: string) {
    console.log(`\x1b[90m${texto}\x1b[0m`);
  },
};
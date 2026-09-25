import type { Canal, Pregunta } from "../canal.js";
import { canalConsola } from "./consola.js";
import { canalTelegram, telegramConfigurado } from "./telegram.js";

export type TipoCanal = "consola" | "telegram" | "ambos";

/** "ambos": pregunta por los dos lados y toma la primera respuesta que llegue */
function combinar(a: Canal, b: Canal): Canal {
  return {
    nombre: `${a.nombre}+${b.nombre}`,
    preguntar: (p: Pregunta, t: number) => Promise.race([a.preguntar(p, t), b.preguntar(p, t)]),
    confirmar: (texto: string, t: number) => Promise.race([a.confirmar(texto, t), b.confirmar(texto, t)]),
    avisar: async (texto: string) => {
      await Promise.all([a.avisar(texto), b.avisar(texto)]);
    },
  };
}

export function obtenerCanal(tipo: TipoCanal): Canal {
  if (tipo === "consola") return canalConsola;

  if (!telegramConfigurado()) {
    console.warn("⚠ Telegram sin configurar (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID). Se usa la consola.");
    return canalConsola;
  }

  return tipo === "telegram" ? canalTelegram : combinar(canalConsola, canalTelegram);
}

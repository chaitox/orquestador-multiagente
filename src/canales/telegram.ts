import { formatearPregunta, type Canal, type Pregunta } from "../canal.js";

/**
 * Telegram por long polling: sin servidor, sin dominio, sin webhook.
 * Soporta un grupo con topics (un hilo por agente), botones inline para
 * preguntas cerradas y correlación por reply_to_message_id para las abiertas.
 *
 *   TELEGRAM_BOT_TOKEN   token de @BotFather
 *   TELEGRAM_CHAT_ID     id del chat o del grupo
 *   TELEGRAM_TOPICS      opcional: "api=12,app=34,portal=56" (message_thread_id por agente)
 */
const TOKEN = () => process.env.TELEGRAM_BOT_TOKEN ?? "";
const CHAT = () => process.env.TELEGRAM_CHAT_ID ?? "";
const api = (metodo: string) => `https://api.telegram.org/bot${TOKEN()}/${metodo}`;

let offset = 0;

export function telegramConfigurado(): boolean {
  return Boolean(TOKEN() && CHAT());
}

function hilo(agente?: string): number | undefined {
  if (!agente) return undefined;
  const mapa = process.env.TELEGRAM_TOPICS ?? "";
  for (const par of mapa.split(",")) {
    const [id, thread] = par.split("=").map((x) => x?.trim());
    if (id === agente && thread) return Number(thread);
  }
  return undefined;
}

interface Boton {
  text: string;
  callback_data: string;
}

async function enviar(texto: string, agente?: string, botones?: Boton[][]): Promise<number | null> {
  const r = await fetch(api("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT(),
      message_thread_id: hilo(agente),
      text: texto.slice(0, 4000),
      disable_web_page_preview: true,
      reply_markup: botones ? { inline_keyboard: botones } : undefined,
    }),
  });
  if (!r.ok) throw new Error(`Telegram sendMessage falló: ${r.status} ${await r.text()}`);
  const data = (await r.json()) as { result?: { message_id: number } };
  return data.result?.message_id ?? null;
}

async function confirmarBoton(callbackId: string, texto: string) {
  await fetch(api("answerCallbackQuery"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, text: texto }),
  }).catch(() => undefined);
}

/**
 * Descarta todo lo que ya estaba en la cola del bot ANTES de hacer una pregunta.
 * Sin esto, cualquier mensaje viejo (una respuesta que llegó tarde a una corrida
 * anterior, un /start) se toma como respuesta de la pregunta nueva — medido: la
 * respuesta sobre "mantenimiento" terminó registrada como respuesta de otra pregunta.
 */
async function vaciarPendientes(): Promise<void> {
  try {
    const r = await fetch(`${api("getUpdates")}?timeout=0&offset=${offset}`);
    const data = (await r.json()) as { result?: Array<{ update_id: number }> };
    for (const u of data.result ?? []) offset = Math.max(offset, u.update_id + 1);
  } catch {
    // si falla, seguimos: el peor caso es el comportamiento anterior
  }
}

interface Update {
  update_id: number;
  message?: { chat: { id: number }; text?: string; reply_to_message?: { message_id: number } };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number } } };
}

/**
 * Espera la respuesta a UNA pregunta concreta.
 * - Botón: el callback_data trae el id de la pregunta → no se cruza con otra.
 * - Texto: solo se acepta si es reply al mensaje de la pregunta.
 */
async function esperarRespuesta(
  idPregunta: string,
  messageId: number | null,
  opciones: string[] | undefined,
  timeoutMin: number,
): Promise<string | null> {
  const limite = Date.now() + timeoutMin * 60_000;

  while (Date.now() < limite) {
    const espera = Math.max(1, Math.min(50, Math.floor((limite - Date.now()) / 1000)));
    try {
      const r = await fetch(`${api("getUpdates")}?timeout=${espera}&offset=${offset}`);
      const data = (await r.json()) as { ok: boolean; result?: Update[] };
      if (!data.ok) continue;

      for (const u of data.result ?? []) {
        offset = u.update_id + 1;

        const cb = u.callback_query;
        if (cb?.data?.startsWith(`${idPregunta}:`)) {
          const indice = Number(cb.data.split(":")[1]);
          const elegida = opciones?.[indice] ?? String(indice);
          await confirmarBoton(cb.id, `Respondido: ${elegida}`);
          return elegida;
        }

        const m = u.message;
        if (!m?.text || String(m.chat.id) !== CHAT()) continue;

        // Las preguntas se hacen de a una, así que cualquier texto del chat es la respuesta.
        // Se aceptan igual el reply y el prefijo con el id, que siguen siendo lo más claro.
        const texto = m.text.trim();
        if (texto.startsWith(`${idPregunta} `)) return texto.slice(idPregunta.length).trim();
        if (texto.startsWith("/")) continue; // comandos del bot, no respuestas
        return texto;
      }
    } catch {
      await new Promise((res) => setTimeout(res, 3000)); // corte de red: reintenta
    }
  }
  return null;
}

export const canalTelegram: Canal = {
  nombre: "telegram",

  async preguntar(p: Pregunta, timeoutMin: number) {
    await vaciarPendientes();
    const botones =
      p.opciones && p.opciones.length >= 2 && p.opciones.length <= 4
        ? [p.opciones.map((o, i) => ({ text: o.slice(0, 30), callback_data: `${p.id}:${i}` }))]
        : undefined;

    const opciones =
      p.opciones?.length ? `\n\nOpciones:\n${p.opciones.map((o, i) => `${i + 1}. ${o}`).join("\n")}` : "";

    const texto =
      `${formatearPregunta(p)}${opciones}\n\n` +
      (botones
        ? "Tocá un botón, o escribí tu respuesta si querés decir otra cosa."
        : "Escribí tu respuesta.");

    const messageId = await enviar(texto, p.agente, botones);
    const r = await esperarRespuesta(p.id, messageId, p.opciones, timeoutMin);
    if (r === null) await enviar(`⏱ ${p.id} sin respuesta: la tarea queda aparcada.`, p.agente);
    return r;
  },

  async confirmar(texto: string, timeoutMin: number) {
    await vaciarPendientes();
    const id = `APR-${Date.now().toString(36).slice(-5)}`;
    const botones = [
      [
        { text: "✅ Sí", callback_data: `${id}:0` },
        { text: "⛔ No", callback_data: `${id}:1` },
      ],
    ];
    await enviar(`${texto}\n\n(${id})`, undefined, botones);
    const r = await esperarRespuesta(id, null, ["si", "no"], timeoutMin);
    if (r === null) return null;
    return /^(s|si|sí|y|yes|ok|dale)/i.test(r.trim());
  },

  async avisar(texto: string, agente?: string) {
    try {
      await enviar(texto, agente);
    } catch {
      // un aviso que falla no debe cortar la tarea
    }
  },
};
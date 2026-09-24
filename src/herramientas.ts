import path from "node:path";
import { z } from "zod";
import type { Buzon } from "./buzon.js";
import type { Canal, Pregunta } from "./canal.js";
import { registrarDecision, siguienteIdDecision } from "./decisiones.js";
import { archivosModificados } from "./git.js";
import { algunaCoincide } from "./glob.js";
import type { AgenteResuelto, ProyectoResuelto } from "./tipos.js";
import { buscarDecisionParecida, validarDondeBusque, validarIdsTarea } from "./validacion-preguntas.js";

/** Contador de preguntas por tarea, para que un agente no dispare una cascada */
export class ContadorPreguntas {
  private n = 0;
  constructor(private readonly max: number) { }
  disponible() {
    return this.n < this.max;
  }
  usar() {
    this.n += 1;
    return this.n;
  }
  get total() {
    return this.n;
  }
}

/**
 * Un agente puede llamar a preguntar varias veces en el mismo turno (la fase 0 lo pide).
 * Sin esto, dos handlers esperan a la vez sobre el mismo stdin / el mismo polling de
 * Telegram y las respuestas se cruzan. Se hacen todas, pero de a una.
 */
let colaPreguntas: Promise<unknown> = Promise.resolve();

function enFila<T>(fn: () => Promise<T>): Promise<T> {
  const siguiente = colaPreguntas.then(fn, fn);
  colaPreguntas = siguiente.catch(() => undefined);
  return siguiente;
}

/** Resultado de una herramienta, con la forma de MCP: texto para el agente y si es un error. */
export type ResultadoHerramienta = {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
};

/** Una herramienta de coordinación, sin atarla a ningún motor: cada motor la expone a su manera. */
export interface Herramienta {
  nombre: string;
  descripcion: string;
  esquema: z.ZodRawShape;
  ejecutar: (args: any) => Promise<ResultadoHerramienta>;
}

function herramienta<S extends z.ZodRawShape>(
  nombre: string,
  descripcion: string,
  esquema: S,
  ejecutar: (args: z.infer<z.ZodObject<S>>) => Promise<ResultadoHerramienta>,
): Herramienta {
  return { nombre, descripcion, esquema, ejecutar };
}

const texto = (mensaje: string, esError = false): ResultadoHerramienta => ({
  content: [{ type: "text" as const, text: mensaje }],
  isError: esError,
});

/**
 * Cada agente recibe el mismo juego de herramientas; lo que cambia son los destinos
 * posibles y el contrato que se le exige al cerrar.
 */
export function herramientasDe(
  proyecto: ProyectoResuelto,
  agente: AgenteResuelto,
  buzon: Buzon,
  feature: string,
  canal: Canal,
  contador: ContadorPreguntas,
  tareaId: string,
) {
  const otros = proyecto.agentes.filter((a) => a.id !== agente.id);

  /** Contrato: devuelve el mensaje de rechazo, o null si cumple. */
  const validarContrato = (): string | null => {
    const patrones = agente.contrato?.requiereCambiosEn ?? [];
    if (patrones.length === 0) return null;

    const relativos = archivosModificados(agente.repo).map((f) =>
      path.relative(agente.raiz, path.join(agente.repo, f)),
    );

    // "si-cambia": solo se exige si la entrega tocó alguno de los disparadores
    const disparadores = agente.contrato?.disparadores ?? [];
    const aplica =
      agente.contrato?.cuando !== "si-cambia" || algunaCoincide(relativos, disparadores, feature).length > 0;
    if (!aplica) return null;

    if (algunaCoincide(relativos, patrones, feature).length > 0) return null;

    const esperado = patrones.map((x) => x.replaceAll("{feature}", feature)).join(", ");
    return (
      agente.contrato?.mensajeRechazo?.replaceAll("{feature}", feature) ??
      `Rechazado: no hay cambios en ${esperado}. El trabajo no está terminado sin eso. ` +
      "Actualizalo y volvé a cerrar."
    );
  };
  const listaDestinos = otros.map((a) => `"${a.id}" (${a.descripcion})`).join(", ");

  return [
      herramienta(
        "preguntar",
        "Preguntar a la persona a cargo y ESPERAR la respuesta. NO es para dudas vagas: es para lo que no " +
        "podés saber porque no está escrito en ningún lado. Obligatorio antes de inventar: " +
        "(1) nombres de cosas que ya existen — tablas, columnas, enums, endpoints, claves de Redis, " +
        "variables de entorno, scripts de npm; (2) reglas de negocio — plata, saldo, estados, " +
        "documentos fiscales; (3) cualquier cosa irreversible; (4) una tarea que admite dos lecturas " +
        "que llevan a implementaciones distintas; (5) alcance que crece más allá de lo que la tarea nombra. " +
        "NO preguntes por estilo, nombres internos nuevos, orden de los tests, ni por nada que se " +
        "responde leyendo un archivo que tenés a mano.",
        {
          pregunta: z.string().min(10).describe("Una sola pregunta, concreta"),
          porQue: z.string().min(10).describe("Qué se bloquea sin esta respuesta"),
          dondeBusque: z
            .array(z.string())
            .min(2)
            .describe("Al menos DOS lugares reales que revisaste: archivos, docs, decisiones.md"),
          opciones: z.array(z.string()).max(6).optional().describe("2 a 4 opciones concretas → botones"),
          recomendacion: z.string().optional().describe("Lo que harías vos. Se muestra, no se ejecuta sola."),
          insistir: z
            .boolean()
            .optional()
            .describe("Solo si ya te devolvieron una decisión previa y de verdad no responde tu pregunta"),
        },
        async (args) => {
          if (!contador.disponible()) {
            return texto(
              "Se alcanzó el máximo de preguntas de esta tarea. Registrá lo que falta con no_se_puede y terminá.",
              true,
            );
          }
          // 1. dondeBusque tiene que ser rutas REALES: un campo de texto libre se
          //    satisface de mentira y entonces no frena nada.
          const v = validarDondeBusque(args.dondeBusque, agente.raiz, agente.lecturaExtra, proyecto.raiz);
          if (!v.ok) {
            return texto(
              v.invalidas.length > 0
                ? `No existen estas rutas de dondeBusque: ${v.invalidas.join(", ")}. ` +
                "Cada entrada debe ser SOLO una ruta, sin comentarios ni explicaciones: " +
                '["api/package.json", "api/src/app.module.ts"]. Sirven carpetas y rutas con línea ' +
                "(src/x.ts:120). Deben existir dentro de tu carpeta, tus lecturas extra o el proyecto."
                : "dondeBusque necesita al menos dos rutas reales distintas.",
              true,
            );
          }

          // 2. Si ya está respondida en decisiones.md, se devuelve sin molestar a nadie.
          if (args.insistir !== true) {
            const previa = buscarDecisionParecida(proyecto.raiz, args.pregunta);
            if (previa) {
              return texto(
                `Ya hay una decisión registrada que parece responder esto.\n\n` +
                `${previa.id} — pregunta: ${previa.pregunta}\n` +
                `Respuesta: ${previa.respuesta}\n\n` +
                `Usala y citá ${previa.id} en tu reporte. Si de verdad no responde tu caso, ` +
                `volvé a llamar preguntar con insistir: true explicando en porQue qué falta.`,
              );
            }
          }

          contador.usar();
          const pregunta: Pregunta = {
            id: "", // se asigna al entrar en la fila: evita ids repetidos en el mismo turno
            agente: agente.id,
            repo: agente.raiz,
            tarea: tareaId,
            feature,
            pregunta: args.pregunta,
            porQue: args.porQue,
            dondeBusque: args.dondeBusque,
            opciones: args.opciones?.length ? args.opciones : undefined,
            recomendacion: args.recomendacion,
          };

          console.log(`\n\x1b[33m⏸  ${agente.id} pregunta ${pregunta.id} — esperando respuesta...\x1b[0m`);
          let respuesta: string | null;
          try {
            respuesta = await enFila(async () => {
              pregunta.id = siguienteIdDecision(proyecto.raiz, feature);
              console.log(`\x1b[33m   ${pregunta.id}\x1b[0m`);
              return canal.preguntar(pregunta, proyecto.preguntas.timeoutMin);
            });
          } catch (e) {
            // Un canal caído NO habilita a suponer: es exactamente el caso que
            // preguntar existe para evitar. Se corta el turno.
            const detalle = e instanceof Error ? e.message : String(e);
            console.error(`\x1b[31m   ✗ el canal falló: ${detalle}\x1b[0m`);
            return texto(
              `La pregunta NO llegó a la persona a cargo: el canal falló (${detalle}). ` +
              "No sigas con un supuesto, no elijas la opción que te parece razonable y no anotes el tema " +
              "como riesgo para continuar: registrá el bloqueo con no_se_puede citando esta pregunta y " +
              "terminá tu turno ahora.",
              true,
            );
          }
          buzon.preguntas.push({ pregunta, respuesta });

          if (respuesta === null) {
            return texto(
              "Sin respuesta dentro del tiempo de espera. No supongas y no sigas: terminá tu turno ahora. " +
              "La tarea queda aparcada y se reanuda cuando la persona a cargo responda.",
              true,
            );
          }

          // La respuesta se escribe en decisiones.md y vuelve citada con su id
          registrarDecision(proyecto.raiz, pregunta, respuesta);
          console.log(`\x1b[32m▶  ${pregunta.id} respondida, ${agente.id} continúa\x1b[0m`);
          return texto(
            `Respuesta a ${pregunta.id}: ${respuesta}\n\n` +
            `Quedó registrada en decisiones.md como ${pregunta.id}. Citá ese id en tu reporte.`,
          );
        },
      ),

      herramienta(
        "solicitar_a",
        `Pedir trabajo a otro agente del proyecto cuando el problema no es de tu parte. Destinos: ${listaDestinos}. ` +
        "Podés pedir a varios en el mismo turno (uno por destino). Después de pedir, terminá tu turno.",
        {
          destino: z.string().describe(`Uno de: ${otros.map((a) => a.id).join(", ")}`),
          problema: z.string().min(20).describe("Qué falla o falta, con datos concretos (request/response, error, archivo)"),
          esperado: z.string().min(20).describe("Qué debería hacer o devolver el otro lado"),
          referencias: z.array(z.string()).optional().describe("Endpoints, archivos o símbolos involucrados"),
        },
        async (args) => {
          if (!otros.some((a) => a.id === args.destino)) {
            return texto(`Destino inválido. Usá uno de: ${otros.map((a) => a.id).join(", ")}`, true);
          }
          if (buzon.solicitudes.some((s) => s.destino === args.destino)) {
            return texto(`Ya hay una solicitud a "${args.destino}" en este turno. Agrupá todo en esa y terminá tu turno.`, true);
          }
          const solicitud = {
            id: buzon.nuevoId(agente.id, args.destino),
            origen: agente.id,
            destino: args.destino,
            feature,
            problema: args.problema,
            esperado: args.esperado,
            referencias: args.referencias ?? [],
            creada: new Date().toISOString(),
          };
          buzon.solicitudes.push(solicitud);
          return texto(
            `Solicitud ${solicitud.id} registrada. No simules la respuesta ni hagas workarounds. ` +
            "Seguí con lo que no dependa de esto y terminá tu turno; vas a ser retomado con la respuesta.",
          );
        },
      ),

      herramienta(
        "entrega_lista",
        "Cerrar la solicitud que estás atendiendo. Se valida contra el contrato configurado del proyecto.",
        {
          resumen: z.string().min(20).describe("Qué cambiaste"),
          archivos: z.array(z.string()).optional().describe("Archivos clave modificados (relativos a tu raíz)"),
          notas: z.string().optional().describe("Indicaciones concretas para el agente que te pidió el trabajo"),
          tareas: z
            .array(z.string())
            .optional()
            .describe("Ids de tareas de la spec que cubre esta entrega (ej: T-01). Obligatorio si el proyecto usa spec."),
        },
        async (args) => {
          const sol = buzon.enCurso;
          if (!sol) return texto("No estás atendiendo ninguna solicitud. Si terminaste tu tarea, usá tarea_completa.", true);

          // Spec-driven: los ids citados tienen que existir en tareas.md
          if (proyecto.spec) {
            const archivo = path.join(
              proyecto.raiz,
              proyecto.spec.dir.replaceAll("{feature}", feature),
              proyecto.spec.archivoTareas ?? "tareas.md",
            );
            const t = validarIdsTarea(archivo, args.tareas ?? []);
            if (!t.ok) {
              return texto(
                t.invalidos.length > 0
                  ? `Estos ids no existen en ${archivo}: ${t.invalidos.join(", ")}. Disponibles: ${t.disponibles.join(", ") || "ninguno"}.`
                  : `Citá los ids de tarea que cubre esta entrega. Disponibles en ${archivo}: ${t.disponibles.join(", ") || "ninguno"}. ` +
                  "Si lo que hiciste no está en la spec, no lo cierres: la spec cambió y eso es una decisión (usá preguntar o no_se_puede).",
                true,
              );
            }
          }

          const rechazo = validarContrato();
          if (rechazo) return texto(rechazo, true);

          buzon.entrega = {
            solicitudId: sol.id,
            agente: agente.id,
            resumen: args.resumen,
            archivos: args.archivos ?? [],
            notas: args.notas,
            tareas: args.tareas ?? [],
          };
          return texto("Entrega registrada. Terminá tu turno.");
        },
      ),

      herramienta(
        "tarea_completa",
        "Marcar tu parte de la tarea como terminada. Solo si compila y las verificaciones pasan.",
        { resumen: z.string().min(20).describe("Qué quedó hecho y qué queda pendiente, si algo") },
        async (args) => {
          // El contrato vale igual al cerrar la tarea propia, no solo al entregar a otro agente
          const rechazo = validarContrato();
          if (rechazo) return texto(rechazo, true);

          buzon.completa = args.resumen;
          return texto("Tarea marcada como completa. Terminá tu turno.");
        },
      ),

      herramienta(
        "no_se_puede",
        "Usar cuando hace falta una decisión humana (reglas de negocio, datos que faltan) o la solicitud es inviable.",
        { motivo: z.string().min(20).describe("Por qué no se puede y qué decisión o dato falta") },
        async (args) => {
          buzon.bloqueo = args.motivo;
          return texto("Bloqueo registrado. Terminá tu turno sin hacer más cambios.");
        },
      ),
  ];
}
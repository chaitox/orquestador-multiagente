import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AgenteResuelto, Proyecto, ProyectoResuelto } from "./tipos.js";

try {
  process.loadEnvFile();
} catch {
  // sin .env: se usan las variables del entorno
}

export const RAIZ_APP = process.cwd();
export const DIR_PROYECTOS = path.join(RAIZ_APP, "proyectos");
export const DIR_PROMPTS = path.join(RAIZ_APP, "prompts");
export const DIR_ESTADO = path.join(RAIZ_APP, ".orquestador");

/** Atajos para no escribir el id completo del modelo en cada agente */
const ALIAS_MODELO: Record<string, string> = {
  opus: "claude-opus-5",
  sonnet: "claude-sonnet-5",
  haiku: "claude-haiku-4-5-20251001",
};

const normalizarModelo = (m: string) => ALIAS_MODELO[m] ?? m;

const PREDETERMINADOS = {
  modeloPorDefecto: "sonnet",
  maxSolicitudes: 6,
  maxTurnos: 200,
  maxIntentosVerificacion: 2,
  recursosEsperaMin: 60,
  sensibles: [] as RegExp[],
  reglasEscalada: [
    "Si la respuesta requiere una decisión que no está escrita en los docs o en las reglas del repo, usá no_se_puede. No la tomes vos ni se la pidas a otro agente.",
    "solicitar_a es para trabajo, no para decisiones.",
  ],
  preguntas: {
    canal: "consola" as const,
    timeoutMin: 30,
    maxPorTarea: 10,
    avisarFin: true,
    fase0: true,
  },
  git: {
    estrategia: "rama-por-tarea" as const,
    prefijoRama: "agente/",
    commitAlCerrar: true,
    exigirLimpio: true,
  },
};

export function listarProyectos(): string[] {
  if (!fs.existsSync(DIR_PROYECTOS)) return [];
  return fs
    .readdirSync(DIR_PROYECTOS)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".js"))
    .map((f) => f.replace(/\.(ts|js)$/, ""));
}

export async function cargarProyecto(
  nombre: string,
  opciones: { exigirRaices?: boolean } = {},
): Promise<ProyectoResuelto> {
  const archivo = [".ts", ".js"]
    .map((ext) => path.join(DIR_PROYECTOS, `${nombre}${ext}`))
    .find((p) => fs.existsSync(p));

  if (!archivo) {
    throw new Error(`No existe proyectos/${nombre}.ts. Disponibles: ${listarProyectos().join(", ") || "ninguno"}`);
  }

  const modulo = (await import(pathToFileURL(archivo).href)) as { default?: Proyecto };
  if (!modulo.default) throw new Error(`proyectos/${nombre}.ts debe tener un 'export default defineProyecto({...})'`);

  return resolver(modulo.default, opciones.exigirRaices ?? true);
}

function resolver(p: Proyecto, exigirRaices: boolean): ProyectoResuelto {
  const raiz = path.resolve(expandir(p.raiz ?? RAIZ_APP));
  const modeloPorDefecto = normalizarModelo(p.modeloPorDefecto ?? PREDETERMINADOS.modeloPorDefecto);

  if (p.agentes.length < 1) throw new Error(`El proyecto ${p.nombre} no define agentes`);

  const ids = new Set<string>();
  const agentes: AgenteResuelto[] = p.agentes.map((a) => {
    if (ids.has(a.id)) throw new Error(`Agente duplicado: ${a.id}`);
    ids.add(a.id);

    const raizAgente = path.resolve(raiz, expandir(a.raiz));
    if (exigirRaices && !fs.existsSync(raizAgente)) {
      throw new Error(
        `La raíz del agente "${a.id}" no existe: ${raizAgente}. ` +
        (a.plantilla ? `Corré: npm run init -- -p ${p.nombre}` : "Creá la carpeta o ajustá el config."),
      );
    }

    const promptAbs = path.join(DIR_PROMPTS, a.prompt);
    if (!fs.existsSync(promptAbs)) throw new Error(`Falta el prompt del agente "${a.id}": prompts/${a.prompt}`);

    return {
      ...a,
      raiz: raizAgente,
      repo: path.resolve(raiz, expandir(a.repo ?? raizAgente)),
      modelo: a.modelo ? normalizarModelo(a.modelo) : modeloPorDefecto,
      lecturaExtra: (a.lecturaExtra ?? []).map((d) => path.resolve(raiz, expandir(d))),
      verificacion: (a.verificacion ?? []).map((v) =>
        typeof v === "string"
          ? { comando: v, reintentar: true }
          : { comando: v.comando, reintentar: v.reintentar ?? true, descripcion: v.descripcion },
      ),
      recursos: a.recursos ?? [],
      ajustes: a.ajustes ?? ["project"],
    };
  });

  if (!ids.has(p.agentePrincipal)) {
    throw new Error(`agentePrincipal "${p.agentePrincipal}" no está en la lista de agentes`);
  }

  return {
    nombre: p.nombre,
    raiz,
    agentePrincipal: p.agentePrincipal,
    agentes,
    modeloPorDefecto,
    maxSolicitudes: p.maxSolicitudes ?? PREDETERMINADOS.maxSolicitudes,
    maxTurnos: p.maxTurnos ?? PREDETERMINADOS.maxTurnos,
    maxIntentosVerificacion: p.maxIntentosVerificacion ?? PREDETERMINADOS.maxIntentosVerificacion,
    recursosEsperaMin: p.recursosEsperaMin ?? PREDETERMINADOS.recursosEsperaMin,
    sensibles: p.sensibles ?? PREDETERMINADOS.sensibles,
    reglasEscalada: p.reglasEscalada ?? PREDETERMINADOS.reglasEscalada,
    preguntas: { ...PREDETERMINADOS.preguntas, ...(p.preguntas ?? {}) },
    spec: p.spec ? { archivoTareas: "tareas.md", ...p.spec } : undefined,
    git: { ...PREDETERMINADOS.git, ...(p.git ?? {}) },
  };
}

/** Permite usar ~ y variables de entorno en las rutas del config */
function expandir(ruta: string): string {
  const conEnv = ruta.replace(/\$\{(\w+)\}/g, (_, v) => process.env[v] ?? "");
  return conEnv.startsWith("~") ? path.join(process.env.HOME ?? "", conEnv.slice(1)) : conEnv;
}

export const buscarAgente = (p: ProyectoResuelto, id: string): AgenteResuelto => {
  const a = p.agentes.find((x) => x.id === id);
  if (!a) throw new Error(`No existe el agente "${id}" en ${p.nombre}`);
  return a;
};

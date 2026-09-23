/**
 * Tipos del archivo de configuración. Un proyecto = un archivo en proyectos/<nombre>.ts
 * No hace falta tocar nada de src/ para agregar un proyecto nuevo.
 */

/** Un comando de verificación. En string plano, es reintentable. */
export type Verificacion =
  | string
  | {
    comando: string;
    /**
     * false = si falla, el orquestador NO le devuelve el error al agente para que
     * lo arregle: detiene la tarea para que lo mires vos. Para gates cuyo verde
     * solo vale si alguien vio el rojo correspondiente.
     */
    reintentar?: boolean;
    descripcion?: string;
  };

export interface Contrato {
  /**
   * Globs (relativos a la raíz del agente) que DEBEN tener cambios para que el agente
   * pueda cerrar una solicitud. Soporta {feature}.
   * Ej: ["docs/{feature}/**"], ["openapi.yaml"], ["packages/tipos/src/**"]
   * Si se omite, no se exige nada.
   */
  requiereCambiosEn?: string[];
  /** Mensaje que ve el agente cuando se le rechaza el cierre */
  mensajeRechazo?: string;
  /**
   * "siempre" (por defecto): toda entrega exige el cambio.
   * "si-cambia": solo se exige cuando la entrega tocó alguno de los globs de `disparadores`.
   * Un contrato que a veces no corresponde enseña al agente a fabricar el cambio para cerrar.
   */
  cuando?: "siempre" | "si-cambia";
  /** Globs que activan el contrato cuando `cuando` es "si-cambia" */
  disparadores?: string[];
}

/** Generadores soportados por `npm run init` */
export type TipoPlantilla =
  | "flutter"
  | "nestjs"
  | "nextjs"
  | "react-vite"
  | "node-ts"
  | "fastapi"
  | "django"
  | "python-lib"
  | "custom";

export interface Plantilla {
  tipo: TipoPlantilla;
  /** Opciones extra para el generador. Ej: ["--platforms", "web"] */
  opciones?: string[];
  /** Solo para tipo "custom": comandos a correr en la carpeta padre. {nombre} = carpeta del agente */
  comandos?: string[];
  /** Comandos a correr dentro del proyecto ya creado (instalar libs, etc.) */
  postInstalacion?: string[];
  /** Crear un CLAUDE.md inicial con las reglas del agente. Por defecto, true. */
  generarClaudeMd?: boolean;
  /** Carpetas a crear al inicializar (con .gitkeep). Ej: ["src/core/helpers", "src/modules"] */
  carpetas?: string[];
}

export interface Agente {
  /** Identificador corto: "front", "api", "worker". Lo usan los otros agentes para pedirle cosas. */
  id: string;
  /** Qué hace este agente. Se le muestra a los demás para que sepan a quién pedirle qué. */
  descripcion: string;
  /** Carpeta donde trabaja. Absoluta, o relativa a `raiz` del proyecto. Es su límite de escritura. */
  raiz: string;
  /** Repo git al que pertenece. Por defecto, su propia raíz. En monorepo, apuntá todos al mismo. */
  repo?: string;
  /** Modelo a usar. Por defecto, `modeloPorDefecto` del proyecto. */
  modelo?: string;
  /** Archivo .md con las instrucciones propias del agente (relativo a prompts/). */
  prompt: string;
  /** Carpetas extra que puede LEER (contratos de otros agentes). Relativas a `raiz` del proyecto. */
  lecturaExtra?: string[];
  /** Comandos que corre el orquestador para validar el trabajo del agente. Se ejecutan en `raiz`. */
  verificacion?: Verificacion[];
  /**
   * Recursos externos compartidos que este agente usa: ["postgres-local", "redis-local", "api-3000"].
   * El orquestador los toma como lock exclusivo mientras el agente trabaja, incluso entre
   * proyectos distintos y entre corridas simultáneas.
   */
  recursos?: string[];
  /** Qué debe haber cambiado para poder cerrar una solicitud. */
  contrato?: Contrato;
  /** Con qué generar la carpeta si no existe (`npm run init`). */
  plantilla?: Plantilla;
  /**
   * Archivo .md con las convenciones de arquitectura del repo (relativo a prompts/).
   * Se copia al CLAUDE.md del proyecto en el init, así el agente lo lee en cada corrida
   * aunque el orquestador no esté presente.
   */
  convenciones?: string;
  /** Comandos bash extra prohibidos para este agente. */
  bashProhibido?: RegExp[];
  /**
   * Qué configuración del disco carga el agente, relativa a SU carpeta:
   * "project" = CLAUDE.md, .claude/rules, .claude/skills, .claude/agents, .claude/settings.json
   * "local"   = .claude/settings.local.json
   * "user"    = ~/.claude (tu config personal, compartida por todos los proyectos)
   * Por defecto: ["project"]. Con [] el agente arranca sin nada del disco.
   */
  ajustes?: Array<"user" | "project" | "local">;
}

export interface ConfigPreguntas {
  /** "consola" (default), "telegram" o "ambos" (gana la primera respuesta) */
  canal?: "consola" | "telegram" | "ambos";
  /** Minutos que el agente espera una respuesta antes de registrar un bloqueo. Default 30. */
  timeoutMin?: number;
  /** Tope de preguntas por tarea: evita que un agente dispare una cascada. Default 10. */
  maxPorTarea?: number;
  /** Avisar por el canal cuando una tarea termina o se detiene. Default true. */
  avisarFin?: boolean;
  /**
   * Fase 0: antes de escribir código, el agente junta TODO lo que no puede resolver
   * y lo pregunta de una vez. Doce preguntas repartidas son doce interrupciones;
   * las mismas doce al principio son un mensaje. Default true.
   */
  fase0?: boolean;
}

export interface ConfigSpec {
  /** Carpeta de la spec, relativa a la raíz del proyecto. Admite {feature}. */
  dir: string;
  /** Archivo de tareas dentro de esa carpeta. Default: "tareas.md". */
  archivoTareas?: string;
  /** Agente que produce la spec (no escribe código). Opcional. */
  agente?: string;
}

export interface ConfigGit {
  /** "rama-por-tarea" crea <prefijo><feature> en cada repo tocado. "ninguna" trabaja donde estés. */
  estrategia: "rama-por-tarea" | "ninguna";
  prefijoRama?: string;
  /** Commit automático cuando un agente cierra una entrega. */
  commitAlCerrar?: boolean;
  /** Exigir árbol limpio antes de empezar. */
  exigirLimpio?: boolean;
}

export interface Proyecto {
  nombre: string;
  /** Base para las rutas relativas de los agentes. Útil en monorepo. */
  raiz?: string;
  /** Agente que arranca la tarea si no pasás --agente. */
  agentePrincipal: string;
  agentes: Agente[];
  modeloPorDefecto?: string;
  /** Máximo de solicitudes entre agentes por tarea. Corta los loops. */
  maxSolicitudes?: number;
  /** Máximo de turnos internos por ejecución de agente. */
  maxTurnos?: number;
  /** Intentos de arreglo cuando falla la verificación. */
  maxIntentosVerificacion?: number;
  /** Minutos que una corrida espera un recurso tomado por otra antes de fallar. Default 60. */
  recursosEsperaMin?: number;
  /** Si una solicitud matchea alguno, se te pide aprobación por consola. */
  sensibles?: RegExp[];
  /**
   * Reglas de escalada que se inyectan en el prompt de TODOS los agentes.
   * Para lo que `sensibles` no puede detectar: una decisión de diseño no tiene
   * palabras predecibles, así que la regla la tiene que tener el agente.
   */
  reglasEscalada?: string[];
  /** Cómo se comunican las preguntas y aprobaciones al humano. */
  preguntas?: ConfigPreguntas;
  /** Spec-driven: si está, toda entrega debe citar ids de tarea que existan. */
  spec?: ConfigSpec;
  git?: ConfigGit;
}

/** Ayuda a tener autocompletado en los archivos de proyectos/. */
export function defineProyecto(p: Proyecto): Proyecto {
  return p;
}

export type ProyectoResuelto = Required<Omit<Proyecto, "raiz" | "git" | "agentes" | "preguntas" | "spec">> & {
  spec?: ConfigSpec;
  raiz: string;
  git: Required<ConfigGit>;
  preguntas: Required<ConfigPreguntas>;
  agentes: AgenteResuelto[];
};

export type AgenteResuelto = Omit<Agente, "verificacion"> & {
  raiz: string;
  repo: string;
  modelo: string;
  lecturaExtra: string[];
  verificacion: Array<{ comando: string; reintentar: boolean; descripcion?: string }>;
  recursos: string[];
  ajustes: Array<"user" | "project" | "local">;
};
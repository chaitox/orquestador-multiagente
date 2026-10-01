import { execFileSync } from "node:child_process";
import path from "node:path";

function git(repo: string, args: string[]): string {
  return gitCrudo(repo, args).trim();
}

/** Sin trim: en `status --porcelain` el espacio inicial de la primera línea es parte del estado */
function gitCrudo(repo: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" });
}

/**
 * Git devuelve las rutas relativas al toplevel del repo. Esto las pasa a relativas a `carpeta`,
 * que puede ser una subcarpeta (monorepo): "specs/lectura/x.md" desde specs/ es "lectura/x.md".
 * Lo que queda fuera de la carpeta vuelve como "../a.txt": sigue contando como cambio.
 * Con --show-prefix y no --show-toplevel: el toplevel viene resuelto (/private/tmp en macOS)
 * y no se podría comparar contra la ruta que recibe la función.
 */
function relativasA(carpeta: string, rutas: string[]): string[] {
  const prefijo = git(carpeta, ["rev-parse", "--show-prefix"]); // "" en el toplevel
  if (!prefijo) return rutas;
  const subida = prefijo.split("/").filter(Boolean).map(() => "..").join("/");
  return rutas.map((r) => (r.startsWith(prefijo) ? r.slice(prefijo.length) : path.posix.join(subida, r)));
}

const ESCAPES_C: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, "\\": 92 };

/**
 * Git entrecomilla las rutas con caracteres especiales y escapa los bytes no ASCII en octal:
 * "dise\303\261o.md". Esto devuelve la ruta tal como está en disco: diseño.md.
 */
function desescapar(ruta: string): string {
  if (ruta.length < 2 || !ruta.startsWith('"') || !ruta.endsWith('"')) return ruta;
  const s = ruta.slice(1, -1);
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "\\") {
      const caracter = String.fromCodePoint(s.codePointAt(i)!);
      bytes.push(...Buffer.from(caracter, "utf8"));
      i += caracter.length - 1;
    } else if (/[0-7]/.test(s[i + 1] ?? "")) {
      bytes.push(parseInt(s.slice(i + 1, i + 4), 8));
      i += 3;
    } else {
      i += 1;
      bytes.push(ESCAPES_C[s[i]] ?? s.charCodeAt(i));
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

export function esRepo(repo: string): boolean {
  try {
    git(repo, ["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

/** Rutas relativas a `repo` (aunque sea una subcarpeta del repo git) con cambios sin commitear, incluye archivos nuevos */
export function archivosModificados(repo: string): string[] {
  const salida = gitCrudo(repo, ["status", "--porcelain", "--untracked-files=all"]);
  const rutas = salida
    .split("\n")
    .filter(Boolean)
    .map((l) => l.slice(3))
    .map((l) => (l.includes(" -> ") ? l.split(" -> ")[1] : l)) // renombrados
    .map(desescapar);
  return relativasA(repo, rutas);
}

export function ramaActual(repo: string): string {
  return git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
}

/**
 * true si no hay cambios DENTRO de `repo`. En un monorepo, `repo` puede ser la subcarpeta de un
 * agente: lo que cambió afuera (otro agente, que vuelve como "../algo") no la ensucia. En el
 * toplevel no hay nada afuera, así que mira todo el repo, como siempre.
 */
export function estaLimpio(repo: string): boolean {
  return archivosModificados(repo).every((f) => f.startsWith("../"));
}

/** Rama base del repo: main, o master si no hay main */
function ramaBase(repo: string): string | null {
  for (const candidata of ["main", "master"]) {
    if (git(repo, ["branch", "--list", candidata]) !== "") return candidata;
  }
  return null;
}

/**
 * Deja el repo en `rama`, creándola desde la base si no existe y **poniéndola al día
 * con la base si ya existía**. Sin esto, una rama creada antes de un merge deja al
 * agente trabajando contra código viejo: medido — un agente no encontró un archivo que
 * ya estaba en main porque su rama era anterior al merge.
 */
export function asegurarRama(repo: string, rama: string) {
  if (!estaLimpio(repo)) {
    throw new Error(`${repo} tiene cambios sin commitear; limpialo antes de pasar a ${rama}`);
  }

  const base = ramaBase(repo);
  const existe = git(repo, ["branch", "--list", rama]) !== "";

  if (!existe) {
    if (base && ramaActual(repo) !== base) git(repo, ["checkout", base]);
    git(repo, ["checkout", "-b", rama]);
    return;
  }

  if (ramaActual(repo) !== rama) git(repo, ["checkout", rama]);

  // Poner la rama al día con la base, si quedó atrás
  if (base && base !== rama) {
    const atrasada = git(repo, ["rev-list", "--count", `${rama}..${base}`]);
    if (atrasada !== "0") {
      console.log(`   ↻ ${repo}: ${rama} estaba ${atrasada} commits atrás de ${base}, se actualiza`);
      try {
        git(repo, ["merge", base, "-m", `actualiza ${rama} con ${base}`]);
      } catch {
        throw new Error(
          `No se pudo actualizar ${rama} con ${base} en ${repo}: hay conflictos. Resolvelos a mano antes de seguir.`,
        );
      }
    }
  }
}

/** Marca con la que EMPIEZA el asunto del commit de rescate de una tarea que no llegó a cerrar */
export const MARCA_SIN_VERIFICAR = "SIN-VERIFICAR";

/**
 * Un rescate es un commit cuyo asunto empieza con la marca, que es como lo escribe `detener`.
 * Buscarla en cualquier parte del asunto contaba como rescate a un commit que solo la menciona:
 * medido con "verificado: 3a99578 revisado (rescate SIN-VERIFICAR)".
 */
const esRescate = (asunto: string) => asunto.startsWith(MARCA_SIN_VERIFICAR);

/** true si el último commit del repo es un rescate que nunca pasó el contrato */
export function ultimoCommitSinVerificar(repo: string): boolean {
  try {
    return esRescate(git(repo, ["log", "-1", "--format=%s"]));
  } catch {
    return false;
  }
}

/**
 * Primer commit, recorriendo el log hacia atrás desde HEAD, que no es un rescate SIN-VERIFICAR:
 * el último punto que pasó el contrato. null si no hay commits o todos son rescates.
 */
export function baseVerificada(repo: string): string | null {
  let log: string;
  try {
    log = git(repo, ["log", "--format=%H%x09%s"]);
  } catch {
    return null; // repo sin commits
  }
  for (const linea of log.split("\n")) {
    const tab = linea.indexOf("\t");
    if (tab === -1) continue;
    if (!esRescate(linea.slice(tab + 1))) return linea.slice(0, tab);
  }
  return null;
}

/** true si `commit` es el HEAD actual del repo */
export function esHead(repo: string, commit: string): boolean {
  return git(repo, ["rev-parse", "HEAD"]) === commit;
}

/** Rutas relativas a `repo` que cambiaron entre `desde` y HEAD (lo ya commiteado). Con -z git no las escapa */
export function archivosCommiteadosDesde(repo: string, desde: string): string[] {
  return relativasA(repo, git(repo, ["diff", "--name-only", "-z", desde, "HEAD"]).split("\0").filter(Boolean));
}

export function commitTodo(repo: string, mensaje: string): boolean {
  if (estaLimpio(repo)) return false;
  // Solo la carpeta: en un monorepo, `repo` es la subcarpeta de un agente, y sin el pathspec
  // `add -A` toma el repo entero, con el trabajo de otros agentes y cambios ajenos a la tarea.
  git(repo, ["add", "-A", "--", "."]);
  // Con pathspec también en el commit: sin él, se commitea todo lo que ya estaba en el índice,
  // aunque sea de otra carpeta (algo que alguien agregó a mano o un agente con `git add` por Bash).
  git(repo, ["commit", "-m", mensaje, "--", "."]);
  return true;
}

/**
 * ¿Hay algún commit en este repo cuyo mensaje cite `id`?
 * Se usa para avisar si una tarea dice depender de algo que no parece estar hecho.
 *
 * El id tiene que aparecer suelto, sin letras ni dígitos pegados de ningún lado: si no, un
 * commit con MP-07 hace pasar a P-07, y uno con T-10 a T-1. Sin distinguir mayúsculas,
 * igual que la extracción de la descripción: un commit que escribió s-13 cita S-13.
 */
export function idCitadoEnCommits(repo: string, id: string): boolean {
  const patron = `(^|[^A-Za-z0-9])${escaparERE(id)}([^A-Za-z0-9]|$)`;
  try {
    return git(repo, ["log", "-E", "-i", "--grep", patron, "--format=%H", "-1"]) !== "";
  } catch {
    return false;
  }
}

/** Escapa los caracteres especiales de una expresión regular extendida POSIX (la de `git log -E`) */
function escaparERE(texto: string): string {
  return texto.replace(/[.^$*+?()[\]{}|\\]/g, "\\$&");
}

import { execFileSync } from "node:child_process";

function git(repo: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

export function esRepo(repo: string): boolean {
  try {
    git(repo, ["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

/** Rutas relativas al repo con cambios sin commitear (incluye archivos nuevos) */
export function archivosModificados(repo: string): string[] {
  const salida = git(repo, ["status", "--porcelain", "--untracked-files=all"]);
  if (!salida) return [];
  return salida
    .split("\n")
    .map((l) => l.slice(3).trim())
    .map((l) => (l.includes(" -> ") ? l.split(" -> ")[1] : l)) // renombrados
    .map((l) => l.replace(/^"|"$/g, ""));
}

export function ramaActual(repo: string): string {
  return git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
}

export function estaLimpio(repo: string): boolean {
  return archivosModificados(repo).length === 0;
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

/** Marca que lleva el commit de rescate de una tarea que no llegó a cerrar */
export const MARCA_SIN_VERIFICAR = "SIN-VERIFICAR";

/** true si el último commit del repo es un rescate que nunca pasó el contrato */
export function ultimoCommitSinVerificar(repo: string): boolean {
  try {
    return git(repo, ["log", "-1", "--format=%s"]).includes(MARCA_SIN_VERIFICAR);
  } catch {
    return false;
  }
}

/**
 * Primer commit, recorriendo el log hacia atrás desde HEAD, cuyo asunto NO lleva la marca
 * SIN-VERIFICAR: el último punto que pasó el contrato. null si no hay commits o todos la llevang.
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
    if (!linea.slice(tab + 1).includes(MARCA_SIN_VERIFICAR)) return linea.slice(0, tab);
  }
  return null;
}

/** true si `commit` es el HEAD actual del repo */
export function esHead(repo: string, commit: string): boolean {
  return git(repo, ["rev-parse", "HEAD"]) === commit;
}

/** Rutas relativas al repo que cambiaron entre `desde` y HEAD (lo ya commiteado) */
export function archivosCommiteadosDesde(repo: string, desde: string): string[] {
  return git(repo, ["diff", "--name-only", "-z", desde, "HEAD"]).split("\0").filter(Boolean);
}

export function commitTodo(repo: string, mensaje: string): boolean {
  if (estaLimpio(repo)) return false;
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-m", mensaje]);
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

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

export function asegurarRama(repo: string, rama: string) {
  if (ramaActual(repo) === rama) return;
  if (!estaLimpio(repo)) {
    throw new Error(`${repo} tiene cambios sin commitear; limpialo antes de pasar a ${rama}`);
  }
  const existe = git(repo, ["branch", "--list", rama]) !== "";
  git(repo, existe ? ["checkout", rama] : ["checkout", "-b", rama]);
}

export function commitTodo(repo: string, mensaje: string): boolean {
  if (estaLimpio(repo)) return false;
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-m", mensaje]);
  return true;
}

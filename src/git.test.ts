/**
 * Rutas de archivosModificados: relativas a la carpeta del agente, no al toplevel del repo,
 * y desescapadas como están en disco. Correr con `npm test`.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { archivosCommiteadosDesde, archivosModificados, commitTodo, estaLimpio } from "./git.js";

describe("archivosModificados en un monorepo", () => {
  let repo: string;
  let base: string;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  const escribir = (ruta: string) => {
    fs.mkdirSync(path.dirname(path.join(repo, ruta)), { recursive: true });
    fs.writeFileSync(path.join(repo, ruta), "x\n");
  };

  before(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "orq-git-"));
    git("init", "-q");
    git("config", "user.email", "test@test");
    git("config", "user.name", "test");
    escribir("a.txt");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    base = git("rev-parse", "HEAD");

    escribir("specs/lectura/commiteado.md");
    git("add", "-A");
    git("commit", "-q", "-m", "SIN-VERIFICAR: rescate");

    fs.appendFileSync(path.join(repo, "a.txt"), "y\n"); // " M a.txt": la primera línea empieza con espacio
    escribir("specs/lectura/requisitos.md");
    escribir("specs/lectura/diseño.md");
    escribir('specs/lectura/con "comillas".md');
  });

  after(() => fs.rmSync(repo, { recursive: true, force: true }));

  it("desde una subcarpeta, las rutas vienen sin el prefijo de la subcarpeta", () => {
    const rutas = archivosModificados(path.join(repo, "specs"));
    assert.ok(rutas.includes("lectura/requisitos.md"), JSON.stringify(rutas));
  });

  it("lo que está fuera de la subcarpeta sigue contando, como ../", () => {
    assert.ok(archivosModificados(path.join(repo, "specs")).includes("../a.txt"));
  });

  it("desde el toplevel, las rutas no cambian (el caso de los proyectos existentes)", () => {
    assert.deepEqual(archivosModificados(repo).sort(), [
      "a.txt",
      'specs/lectura/con "comillas".md',
      "specs/lectura/diseño.md",
      "specs/lectura/requisitos.md",
    ]);
  });

  it("los nombres con ñ y comillas vuelven como están en disco", () => {
    const rutas = archivosModificados(path.join(repo, "specs"));
    assert.ok(rutas.includes("lectura/diseño.md"), JSON.stringify(rutas));
    assert.ok(rutas.includes('lectura/con "comillas".md'), JSON.stringify(rutas));
  });

  it("archivosCommiteadosDesde también es relativo a la subcarpeta", () => {
    assert.deepEqual(archivosCommiteadosDesde(path.join(repo, "specs"), base), ["lectura/commiteado.md"]);
  });
});

describe("estaLimpio en un monorepo", () => {
  let repo: string;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();

  before(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "orq-limpio-"));
    git("init", "-q");
    git("config", "user.email", "test@test");
    git("config", "user.name", "test");
    for (const carpeta of ["specs", "servidor"]) {
      fs.mkdirSync(path.join(repo, carpeta));
      fs.writeFileSync(path.join(repo, carpeta, "README.md"), "x\n");
    }
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    fs.writeFileSync(path.join(repo, "specs", "requisitos.md"), "spec escribió esto\n");
  });

  after(() => fs.rmSync(repo, { recursive: true, force: true }));

  it("lo que escribió otro agente no ensucia la carpeta de este", () => {
    assert.equal(estaLimpio(path.join(repo, "servidor")), true);
  });

  it("la carpeta que tiene los cambios sí está sucia", () => {
    assert.equal(estaLimpio(path.join(repo, "specs")), false);
  });

  it("desde el toplevel mira todo el repo, como antes", () => {
    assert.equal(estaLimpio(repo), false);
  });
});

describe("commitTodo en un monorepo", () => {
  let repo: string;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();

  before(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "orq-commit-"));
    git("init", "-q");
    git("config", "user.email", "test@test");
    git("config", "user.name", "test");
    git("commit", "-q", "--allow-empty", "-m", "base");
    for (const [carpeta, archivo] of [["specs", "requisitos.md"], ["servidor", "api.ts"]]) {
      fs.mkdirSync(path.join(repo, carpeta));
      fs.writeFileSync(path.join(repo, carpeta, archivo), "x\n");
    }
    // Un cambio de la raíz que alguien ya agregó al índice (a mano, o un agente con `git add`)
    fs.writeFileSync(path.join(repo, "NOTAS.md"), "x\n");
    git("add", "NOTAS.md");
  });

  after(() => fs.rmSync(repo, { recursive: true, force: true }));

  it("commitea solo los archivos de su carpeta, aunque haya otra cosa en el índice", () => {
    assert.equal(commitTodo(path.join(repo, "servidor"), "servidor(x): entrega"), true);
    assert.deepEqual(git("show", "--name-only", "--format=", "HEAD").split("\n"), ["servidor/api.ts"]);
    assert.equal(estaLimpio(path.join(repo, "specs")), false, "lo de specs sigue sin commitear");
    assert.equal(git("diff", "--cached", "--name-only"), "NOTAS.md", "NOTAS.md sigue en el índice, sin commitear");
  });
});

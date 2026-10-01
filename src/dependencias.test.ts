/**
 * Aviso de dependencias no encontradas: los casos que rompían la primera versión.
 * Correr con `npm test`.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { idCitadoEnCommits } from "./git.js";
import { idsDeDependencia } from "./orquestador.js";

describe("idsDeDependencia", () => {
  it("toma todos los ids de una lista, no solo el primero", () => {
    assert.deepEqual(idsDeDependencia("Dependen de MI-16, P-07 y S-13."), ["MI-16", "P-07", "S-13"]);
  });

  it('"pre-2024" no es un id, ni se corta en PRE-202', () => {
    assert.deepEqual(idsDeDependencia("Depende del pre-2024 para el reporte."), []);
  });
});

describe("idCitadoEnCommits", () => {
  let repo: string;

  before(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "orq-dependencias-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
    git("init", "-q");
    git("config", "user.email", "test@test");
    git("config", "user.name", "test");
    for (const mensaje of ["api(x): implementa T-10", "front(x): MP-07 listo", "api(x): cierra s-13"]) {
      git("commit", "-q", "--allow-empty", "-m", mensaje);
    }
  });

  after(() => fs.rmSync(repo, { recursive: true, force: true }));

  it("un id más largo no hace pasar al corto", () => {
    assert.equal(idCitadoEnCommits(repo, "P-07"), false, "MP-07 no cita P-07");
    assert.equal(idCitadoEnCommits(repo, "T-1"), false, "T-10 no cita T-1");
    assert.equal(idCitadoEnCommits(repo, "MP-07"), true);
    assert.equal(idCitadoEnCommits(repo, "T-10"), true);
  });

  it("un id escrito en minúscula en el commit cuenta", () => {
    assert.equal(idCitadoEnCommits(repo, "S-13"), true);
  });

  it("los caracteres especiales del id se buscan literales", () => {
    // Sin escapar, el punto sería comodín y T.10 encontraría T-10
    assert.equal(idCitadoEnCommits(repo, "T.10"), false);
  });
});

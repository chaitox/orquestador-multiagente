/**
 * El contrato de un agente solo cuenta cambios dentro de su carpeta: lo que cambió afuera
 * (otro agente, la raíz del repo) no alcanza para cerrar, sea cual sea el patrón.
 * Correr con `npm test`.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { Buzon } from "./buzon.js";
import { ContadorPreguntas, herramientasDe } from "./herramientas.js";

describe("contrato en un monorepo", () => {
  let repo: string;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();

  const cerrar = async (carpeta: string) => {
    const raiz = path.join(repo, carpeta);
    const agente = {
      id: carpeta, descripcion: carpeta, raiz, repo: raiz, modelo: "m", prompt: "p.md",
      lecturaExtra: [], verificacion: [], recursos: [], ajustes: [],
      contrato: { requiereCambiosEn: ["**/*.md"] },
    };
    const proyecto = { nombre: "ctrl", raiz: repo, agentes: [agente], preguntas: { maxPorTarea: 1 } };
    const herramientas = herramientasDe(
      proyecto as any, agente as any, new Buzon(), "x", {} as any, new ContadorPreguntas(1), "T",
    );
    const r = await herramientas.find((h) => h.nombre === "tarea_completa")!.ejecutar({
      resumen: "cierre de prueba con resumen suficientemente largo",
    });
    return r;
  };

  before(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "orq-contrato-"));
    git("init", "-q");
    git("config", "user.email", "test@test");
    git("config", "user.name", "test");
    for (const carpeta of ["specs", "servidor"]) {
      fs.mkdirSync(path.join(repo, carpeta));
      fs.writeFileSync(path.join(repo, carpeta, ".gitkeep"), "");
    }
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    // Cambios solo fuera de servidor/: en otra carpeta de agente y en la raíz del repo
    fs.mkdirSync(path.join(repo, "specs", "lectura"));
    fs.writeFileSync(path.join(repo, "specs", "lectura", "requisitos.md"), "x\n");
    fs.writeFileSync(path.join(repo, "NOTAS.md"), "x\n");
  });

  after(() => fs.rmSync(repo, { recursive: true, force: true }));

  it("con **/*.md, un cambio solo en otra carpeta no alcanza para cerrar", async () => {
    const r = await cerrar("servidor");
    assert.equal(r.isError, true, r.content[0].text);
  });

  it("el mismo patrón sí cierra con un cambio en su propia carpeta", async () => {
    const r = await cerrar("specs");
    assert.equal(r.isError, false, r.content[0].text);
  });
});

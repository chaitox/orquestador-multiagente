/**
 * Rescate en un monorepo: dos agentes en subcarpetas del mismo repo escriben, la tarea se
 * detiene, y cada carpeta queda en su propio commit SIN-VERIFICAR. Lo que está suelto en la
 * raíz del repo no lo commitea nadie.
 *
 * Corre el `detener` real de ejecutarTarea; solo el motor (el SDK) está simulado.
 * Correr con `npm test`.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import type { Buzon } from "./buzon.js";

const MOTOR = new URL("./motores/claude.ts", import.meta.url).href;

describe("rescate con dos agentes en el mismo repo", () => {
  const dirOriginal = process.cwd();
  let app: string;
  let repo: string;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  const archivosDe = (commit: string) => git("show", "--name-only", "--format=", commit).split("\n").filter(Boolean);

  before(async () => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "orq-rescate-repo-"));
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@test");
    git("config", "user.name", "test");
    for (const carpeta of ["specs", "servidor"]) {
      fs.mkdirSync(path.join(repo, carpeta));
      fs.writeFileSync(path.join(repo, carpeta, ".gitkeep"), "");
    }
    fs.writeFileSync(path.join(repo, "NOTAS.md"), "nota\n");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    // Cambio suelto en la raíz, que no es de ningún agente
    fs.appendFileSync(path.join(repo, "NOTAS.md"), "cambio ajeno a la tarea\n");

    // El estado de la tarea (.orquestador/) se escribe en el cwd: que sea uno temporal
    app = fs.mkdtempSync(path.join(os.tmpdir(), "orq-rescate-app-"));
    process.chdir(app);

    mock.module(MOTOR, {
      namedExports: {
        opcionesDe: (_p: unknown, _a: unknown, buzon: Buzon) => ({ buzon }),
        esErrorDeRed: () => false,
        ejecutarAgente: async (agenteId: string, _prompt: string, o: { buzon: Buzon }) => {
          if (agenteId === "spec") {
            fs.writeFileSync(path.join(repo, "specs", "requisitos.md"), "requisitos\n");
            o.buzon.solicitudes.push({
              id: "S-1", origen: "spec", destino: "servidor", feature: "x",
              problema: "p", esperado: "e", referencias: [], creada: new Date().toISOString(),
            });
          } else {
            // servidor escribe y nunca cierra: recordatorio, y después detener
            fs.writeFileSync(path.join(repo, "servidor", "api.ts"), "export {};\n");
          }
          return { ok: true, costoUsd: 0 };
        },
      },
    });
  });

  after(() => {
    process.chdir(dirOriginal);
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(app, { recursive: true, force: true });
  });

  it("cada carpeta queda en su propio commit SIN-VERIFICAR y la raíz no se commitea", async () => {
    const { ejecutarTarea } = await import("./orquestador.js");
    const agente = (id: string, carpeta: string) => ({
      id, descripcion: id, raiz: path.join(repo, carpeta), repo: path.join(repo, carpeta),
      modelo: "m", prompt: "p.md", lecturaExtra: [], verificacion: [], recursos: [], ajustes: [],
    });
    const p = {
      nombre: "ctrl-rescate", raiz: repo, agentePrincipal: "spec",
      agentes: [agente("spec", "specs"), agente("servidor", "servidor")],
      modeloPorDefecto: "m", maxSolicitudes: 5, maxTurnos: 1, maxIntentosVerificacion: 1,
      recursosEsperaMin: 1, sensibles: [], reglasEscalada: [],
      preguntas: { canal: "consola", timeoutMin: 1, maxPorTarea: 1, avisarFin: false, fase0: false },
      git: { estrategia: "rama-por-tarea", prefijoRama: "agente/", commitAlCerrar: true, exigirLimpio: true },
    } as any;

    const estado = await ejecutarTarea(p, { descripcion: "tarea de control", feature: "x" });
    assert.equal(estado.estado, "detenida");

    const [ultimo, anterior] = git("log", "-2", "--format=%H").split("\n");
    for (const c of [ultimo, anterior]) assert.match(git("log", "-1", "--format=%s", c), /^SIN-VERIFICAR/);
    assert.deepEqual(archivosDe(anterior), ["specs/requisitos.md"]);
    assert.deepEqual(archivosDe(ultimo), ["servidor/api.ts"]);

    assert.equal(git("status", "--porcelain"), "M NOTAS.md", "el cambio suelto de la raíz sigue sin commitear");
  });
});

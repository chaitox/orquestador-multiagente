/**
 * El CLAUDE.md que genera el init. Correr con `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { contenidoClaudeMd } from "./scaffold.js";

describe("contenidoClaudeMd", () => {
  const agente = (verificacion: unknown[]) =>
    ({
      id: "servidor", descripcion: "API local", raiz: "/tmp/x", repo: "/tmp/x", prompt: "p.md",
      lecturaExtra: [], recursos: [], ajustes: [], verificacion,
    }) as any;
  const proyecto = { nombre: "interfaz" } as any;

  it("las verificaciones con comando y reintentar se escriben como comandos", () => {
    const md = contenidoClaudeMd(
      agente([
        { comando: "npx tsc --noEmit", reintentar: true },
        { comando: "npm test", reintentar: false },
      ]),
      proyecto,
    );
    assert.match(md, /^- Antes de cerrar: npx tsc --noEmit && npm test$/m);
    assert.doesNotMatch(md, /\[object Object\]/);
  });

  it("las verificaciones como cadena siguen funcionando", () => {
    const md = contenidoClaudeMd(agente(["npm run build"]), proyecto);
    assert.match(md, /^- Antes de cerrar: npm run build$/m);
  });
});

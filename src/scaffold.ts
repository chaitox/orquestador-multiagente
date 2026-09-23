import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DIR_PROMPTS } from "./config.js";
import { RECETAS, type Receta } from "./plantillas.js";
import type { AgenteResuelto, ProyectoResuelto } from "./tipos.js";

interface OpcionesInit {
  soloAgente?: string;
  simular?: boolean;
  /** Actualiza el SDK local (flutter upgrade, uv self update) antes de crear */
  actualizar?: boolean;
}

export function inicializar(p: ProyectoResuelto, o: OpcionesInit = {}) {
  const agentes = o.soloAgente ? p.agentes.filter((a) => a.id === o.soloAgente) : p.agentes;
  if (agentes.length === 0) throw new Error(`No hay agente "${o.soloAgente}" en ${p.nombre}`);

  console.log(`\n▶ init de "${p.nombre}"${o.simular ? " (simulación)" : ""}\n`);
  const sugerencias: string[] = [];

  for (const a of agentes) {
    if (fs.existsSync(a.raiz) && fs.readdirSync(a.raiz).length > 0) {
      console.log(`  ✓ "${a.id}" ya existe: ${a.raiz}`);
      continue;
    }
    if (!a.plantilla) {
      console.log(`  – "${a.id}" no tiene plantilla; creá la carpeta a mano: ${a.raiz}`);
      continue;
    }

    const receta = obtenerReceta(a);
    faltantes(receta.requiere).forEach((b) => {
      throw new Error(`Para crear "${a.id}" hace falta "${b}" instalado.${receta.notas ? ` ${receta.notas}` : ""}`);
    });

    if (o.actualizar && receta.actualizarCmd && !o.simular) {
      console.log(`    $ ${receta.actualizarCmd}`);
      execSync(receta.actualizarCmd, { stdio: "inherit" });
    }

    if (receta.versionCmd) {
      const v = intentar(receta.versionCmd, path.dirname(a.raiz));
      if (v) console.log(`    versión local: ${v.split("\n")[0]}`);
    }

    const padre = path.dirname(a.raiz);
    const nombre = path.basename(a.raiz);
    fs.mkdirSync(padre, { recursive: true });

    const crear = receta.crear.map((c) => aplicar(c, nombre, a));
    const post = (receta.post ?? []).concat(a.plantilla.postInstalacion ?? []).map((c) => aplicar(c, nombre, a));

    console.log(`\n  ⚙ creando "${a.id}" en ${a.raiz}`);
    ejecutar(crear, padre, o.simular);
    ejecutar(post, a.raiz, o.simular);

    if (!o.simular) {
      crearCarpetas(a);
      inicializarGit(a);
      crearCarpetasDeContrato(a);
      if (a.plantilla.generarClaudeMd !== false) escribirClaudeMd(a, p);
    }

    if (a.verificacion.length === 0 && receta.verificacionSugerida.length > 0) {
      sugerencias.push(`  "${a.id}": verificacion: ${JSON.stringify(receta.verificacionSugerida)}`);
    }
    console.log(`  ✓ "${a.id}" listo`);
  }

  if (sugerencias.length > 0) {
    console.log("\nSugerencia para el config (agentes sin verificación):");
    sugerencias.forEach((s) => console.log(s));
  }
  console.log(`\n✅ init terminado. Probá: npm run tarea -- -p ${p.nombre} -f <feature> "<tarea>"\n`);
}

/* ----------------------------- helpers ----------------------------- */

function obtenerReceta(a: AgenteResuelto): Receta {
  const pl = a.plantilla!;
  if (pl.tipo === "custom") {
    if (!pl.comandos?.length) throw new Error(`El agente "${a.id}" usa plantilla "custom" sin comandos`);
    return { requiere: [], crear: pl.comandos, verificacionSugerida: [] };
  }
  const receta = RECETAS[pl.tipo];
  if (!receta) throw new Error(`Plantilla desconocida: ${pl.tipo}`);
  return receta;
}

const aplicar = (comando: string, nombre: string, a: AgenteResuelto) =>
  comando.replaceAll("{nombre}", nombre) + extras(comando, a);

/** Las opciones del config se agregan al comando de creación, no a los de post */
function extras(comando: string, a: AgenteResuelto): string {
  const opciones = a.plantilla?.opciones ?? [];
  const esCreacion = (obtenerRecetaSegura(a)?.crear ?? []).some((c) => comando.startsWith(c.split(" ")[0]));
  return opciones.length > 0 && esCreacion ? ` ${opciones.join(" ")}` : "";
}

function obtenerRecetaSegura(a: AgenteResuelto): Receta | undefined {
  try {
    return obtenerReceta(a);
  } catch {
    return undefined;
  }
}

function ejecutar(comandos: string[], cwd: string, simular?: boolean) {
  for (const c of comandos) {
    console.log(`    $ ${c}`);
    if (simular) continue;
    execSync(c, { cwd, stdio: "inherit", timeout: 20 * 60_000 });
  }
}

function faltantes(binarios: string[]): string[] {
  return binarios.filter((b) => !intentar(`command -v ${b}`, process.cwd()));
}

function intentar(comando: string, cwd: string): string | null {
  try {
    return execSync(comando, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  } catch {
    return null;
  }
}

const IGNORAR = [
  "node_modules/",
  "dist/",
  "build/",
  ".next/",
  ".env",
  ".env.local",
  "*.tsbuildinfo",
  ".DS_Store",
  "coverage/",
  ".dart_tool/",
  "build/",
  "*.log",
];

/**
 * Crea el .gitignore ANTES del primer commit. Sin esto, el generador deja
 * node_modules en el árbol y el commit inicial se lo lleva puesto: medido, un repo
 * con 200 MB de dependencias versionadas y un `git status` inutilizable.
 */
function asegurarGitignore(repo: string) {
  const archivo = path.join(repo, ".gitignore");
  const actual = fs.existsSync(archivo) ? fs.readFileSync(archivo, "utf8") : "";
  const faltantes = IGNORAR.filter((linea) => !actual.split("\n").some((l) => l.trim() === linea));
  if (faltantes.length === 0) return;

  const contenido = actual.trim() === "" ? faltantes.join("\n") : `${actual.trimEnd()}\n${faltantes.join("\n")}`;
  fs.writeFileSync(archivo, `${contenido}\n`);
  console.log("    .gitignore actualizado");
}

function inicializarGit(a: AgenteResuelto) {
  fs.mkdirSync(a.repo, { recursive: true });
  asegurarGitignore(a.repo);
  if (fs.existsSync(path.join(a.repo, ".git"))) return;
  execSync("git init -q && git add -A && git commit -q -m 'init' --allow-empty", { cwd: a.repo, stdio: "pipe" });
  console.log(`    repo git inicializado en ${a.repo}`);
}

/** Crea las carpetas fijas del contrato (ej: docs/ de "docs/{feature}/**") */
/** Estructura de carpetas que el proyecto debe tener desde el día uno */
function crearCarpetas(a: AgenteResuelto) {
  for (const carpeta of a.plantilla?.carpetas ?? []) {
    const dir = path.join(a.raiz, carpeta);
    fs.mkdirSync(dir, { recursive: true });
    const guarda = path.join(dir, ".gitkeep");
    if (fs.readdirSync(dir).length === 0) fs.writeFileSync(guarda, "");
    console.log(`    carpeta: ${carpeta}/`);
  }
}

function crearCarpetasDeContrato(a: AgenteResuelto) {
  for (const patron of a.contrato?.requiereCambiosEn ?? []) {
    const fija = patron.split("/").filter((s) => !s.includes("*") && !s.includes("{"));
    if (fija.length === 0) continue;
    const dir = path.join(a.raiz, ...fija);
    if (path.extname(dir)) continue; // es un archivo, no una carpeta
    fs.mkdirSync(dir, { recursive: true });
    console.log(`    carpeta de contrato: ${path.relative(a.raiz, dir)}/`);
  }
}

function escribirClaudeMd(a: AgenteResuelto, p: ProyectoResuelto) {
  const destino = path.join(a.raiz, "CLAUDE.md");
  if (fs.existsSync(destino)) return;

  const convenciones = a.convenciones
    ? fs.readFileSync(path.join(DIR_PROMPTS, a.convenciones), "utf8").trim()
    : "";

  const contrato = a.contrato?.requiereCambiosEn ?? [];
  const contenido = [
    `# ${a.id} — ${p.nombre}`,
    "",
    a.descripcion,
    "",
    "## Reglas",
    "- No hagas commits, push ni cambios de rama: los maneja el orquestador.",
    "- Si algo depende de otra parte del sistema, pedilo con `solicitar_a` en vez de resolverlo acá.",
    contrato.length ? `- Toda entrega requiere actualizar: ${contrato.join(", ")}` : "",
    a.verificacion.length ? `- Antes de cerrar: ${a.verificacion.join(" && ")}` : "",
    "",
    convenciones || "## Notas del proyecto\n(completar: convenciones, estructura, comandos útiles)",
  ]
    .filter(Boolean)
    .join("\n");

  fs.writeFileSync(destino, `${contenido}\n`);
  console.log("    CLAUDE.md creado");
}
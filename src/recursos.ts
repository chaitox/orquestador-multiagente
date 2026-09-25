import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Locks de recursos externos: base, Redis, un puerto, un entorno de demo.
 * El límite de escritura de un agente es su carpeta, pero eso no cubre lo que
 * comparten por fuera del filesystem. Los locks viven en el HOME, así que valen
 * entre proyectos distintos y entre corridas simultáneas del orquestador.
 */
const DIR_LOCKS = path.join(os.homedir(), ".orquestador-locks");
const VENCIMIENTO_MS = 60 * 60 * 1000; // un lock más viejo que esto se considera huérfano

export interface Lock {
  recurso: string;
  archivo: string;
}

interface Contenido {
  pid: number;
  proyecto: string;
  agente: string;
  desde: string;
}

export async function adquirir(
  recursos: string[],
  proyecto: string,
  agente: string,
  esperaMin = 60,
): Promise<Lock[]> {
  if (recursos.length === 0) return [];
  fs.mkdirSync(DIR_LOCKS, { recursive: true });

  const tomados: Lock[] = [];
  try {
    for (const recurso of [...recursos].sort()) {
      // orden alfabético: evita deadlocks si dos corridas piden los mismos recursos
      const archivo = path.join(DIR_LOCKS, `${recurso.replace(/[^\w.-]/g, "_")}.lock`);
      await esperarLibre(archivo, recurso, esperaMin);
      const contenido: Contenido = { pid: process.pid, proyecto, agente, desde: new Date().toISOString() };
      fs.writeFileSync(archivo, JSON.stringify(contenido), { flag: "wx" });
      tomados.push({ recurso, archivo });
    }
    return tomados;
  } catch (e) {
    liberar(tomados);
    throw e;
  }
}

export function liberar(locks: Lock[]) {
  for (const l of locks) {
    try {
      fs.rmSync(l.archivo, { force: true });
    } catch {
      // si no se puede borrar, el vencimiento lo resuelve
    }
  }
}

/** Espera a que el recurso se libere. Solo falla si se agota `esperaMin`. */
async function esperarLibre(archivo: string, recurso: string, esperaMin: number) {
  const limite = Date.now() + esperaMin * 60_000;
  let avisado = false;

  while (true) {
    if (!fs.existsSync(archivo)) return;

    const info = leer(archivo);
    const vencido = info ? Date.now() - new Date(info.desde).getTime() > VENCIMIENTO_MS : true;
    const procesoMuerto = info ? !vive(info.pid) : true;

    if (vencido || procesoMuerto) {
      console.warn(`   ⚠ lock huérfano de "${recurso}" (pid ${info?.pid ?? "?"}): se libera`);
      fs.rmSync(archivo, { force: true });
      return;
    }

    if (Date.now() >= limite) {
      throw new Error(
        `El recurso "${recurso}" sigue tomado por ${info?.proyecto}/${info?.agente} (pid ${info?.pid}) ` +
          `después de esperar ${esperaMin} min. Revisá ese proceso o borrá ${archivo}.`,
      );
    }

    if (!avisado) {
      console.log(`   ⏳ esperando "${recurso}", tomado por ${info?.proyecto}/${info?.agente} (pid ${info?.pid})`);
      avisado = true;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

function leer(archivo: string): Contenido | null {
  try {
    return JSON.parse(fs.readFileSync(archivo, "utf8")) as Contenido;
  } catch {
    return null;
  }
}

function vive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

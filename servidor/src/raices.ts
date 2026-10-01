import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));

/**
 * No se reutiliza RAIZ_APP de src/config.ts (que sale de process.cwd()) porque este
 * paquete arranca con `npm start` dentro de servidor/, no desde la raíz del repo: usar
 * cwd ahí apuntaría .orquestador y proyectos/ adentro de servidor/.
 */
export const RAIZ_REPO = path.resolve(AQUI, "..", "..");
export const DIR_PROYECTOS = path.join(RAIZ_REPO, "proyectos");
export const DIR_ESTADO = path.join(RAIZ_REPO, ".orquestador");

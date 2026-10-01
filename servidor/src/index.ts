import { crearServidor } from "./servidor.js";
import { RAIZ_REPO } from "./raices.js";

const PUERTO = 4710;
const HOST = "127.0.0.1";

/**
 * src/config.ts resuelve rutas relativas del config (ej. `raiz: "."` en proyectos/interfaz.ts)
 * con `path.resolve()` contra `process.cwd()` en el momento en que corre `resolver()`, no
 * contra la constante `RAIZ_APP` que ese mismo módulo calculó al importarse. Este servidor
 * arranca con `npm start` dentro de `servidor/` (cwd != raíz del repo), así que sin este
 * `chdir` una raíz "." se resolvería a `servidor/` en vez de a la raíz del repo. Se hace una
 * sola vez acá, antes de levantar el servidor y de que exista ningún request concurrente:
 * ver servidor/src/proyectoConfig.ts, que depende de este cwd ya corregido.
 */
process.chdir(RAIZ_REPO);

const servidor = crearServidor();
servidor.listen(PUERTO, HOST, () => {
  console.log(`servidor de lectura escuchando en http://${HOST}:${PUERTO}`);
});

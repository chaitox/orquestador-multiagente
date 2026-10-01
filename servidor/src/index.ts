import { crearServidor } from "./servidor.js";

const PUERTO = 4710;
const HOST = "127.0.0.1";

const servidor = crearServidor();
servidor.listen(PUERTO, HOST, () => {
  console.log(`servidor de lectura escuchando en http://${HOST}:${PUERTO}`);
});

import { parseArgs } from "node:util";
import { cargarProyecto, listarProyectos } from "./config.js";
import { inicializar } from "./scaffold.js";

const { values } = parseArgs({
  options: {
    proyecto: { type: "string", short: "p" },
    agente: { type: "string", short: "a" },
    simular: { type: "boolean", short: "s" },
    actualizar: { type: "boolean", short: "u" },
  },
});

if (!values.proyecto) {
  console.log("Uso: npm run init -- -p <proyecto> [-a <agente>] [--simular] [--actualizar]");
  console.log(`Proyectos: ${listarProyectos().join(", ") || "ninguno"}`);
  console.log("  --simular    muestra los comandos sin ejecutarlos");
  console.log("  --actualizar actualiza el SDK local antes de crear (flutter upgrade, uv self update)");
  process.exit(1);
}

// Acá las carpetas todavía no existen: por eso no se exige que estén
const proyecto = await cargarProyecto(values.proyecto, { exigirRaices: false });

inicializar(proyecto, {
  soloAgente: values.agente,
  simular: values.simular,
  actualizar: values.actualizar,
});

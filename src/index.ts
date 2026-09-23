import { parseArgs } from "node:util";
import { cargarProyecto, listarProyectos } from "./config.js";
import { ejecutarTarea } from "./orquestador.js";

const { values, positionals } = parseArgs({
  options: {
    proyecto: { type: "string", short: "p" },
    feature: { type: "string", short: "f" },
    agente: { type: "string", short: "a" },
    listar: { type: "boolean", short: "l" },
  },
  allowPositionals: true,
});

if (values.listar) {
  console.log("Proyectos disponibles:");
  for (const n of listarProyectos()) console.log(`  - ${n}`);
  process.exit(0);
}

const descripcion = positionals.join(" ").trim();

if (!values.proyecto || !values.feature || !descripcion) {
  console.log('Uso: npm run tarea -- -p <proyecto> -f <feature> [-a <agente>] "descripción"');
  console.log('Ej:  npm run tarea -- -p pedidos -f pedidos "Integrar la pantalla de pedidos"');
  console.log("     npm run tarea -- --listar");
  process.exit(1);
}

if (!/^[a-z0-9._-]+$/.test(values.feature)) {
  console.error("La feature debe ser minúsculas, números, punto, guion o guion bajo (se usa en la rama y en los contratos).");
  process.exit(1);
}

const proyecto = await cargarProyecto(values.proyecto);
const estado = await ejecutarTarea(proyecto, {
  descripcion,
  feature: values.feature,
  agenteInicial: values.agente,
});

process.exit(estado.estado === "completada" ? 0 : 2);

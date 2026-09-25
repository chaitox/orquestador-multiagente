import { parseArgs } from "node:util";
import { cargarProyecto } from "./config.js";
import { cargarTarea, reanudarTarea } from "./orquestador.js";

const { values } = parseArgs({
  options: {
    proyecto: { type: "string", short: "p" },
    tarea: { type: "string", short: "t" },
    respuesta: { type: "string", short: "r" },
    ver: { type: "boolean", short: "v" },
  },
});

if (!values.proyecto || !values.tarea) {
  console.log('Uso: npm run reanudar -- -p <proyecto> -t <tareaId> -r "<respuesta>"');
  console.log("     npm run reanudar -- -p <proyecto> -t <tareaId> --ver   (ver la pregunta pendiente)");
  process.exit(1);
}

if (values.ver) {
  const estado = cargarTarea(values.proyecto, values.tarea);
  console.log(`Estado: ${estado.estado}`);
  if (estado.pendiente) {
    const q = estado.pendiente.pregunta;
    console.log(`\n${q.id} — ${q.agente}\n${q.pregunta}\n\nSe bloquea: ${q.porQue}\nBuscó en: ${q.dondeBusque.join(", ")}`);
    if (q.recomendacion) console.log(`Recomienda: ${q.recomendacion}`);
    if (q.opciones?.length) console.log(`Opciones: ${q.opciones.join(" | ")}`);
  }
  process.exit(0);
}

if (!values.respuesta) {
  console.error('Falta la respuesta: -r "..."');
  process.exit(1);
}

const proyecto = await cargarProyecto(values.proyecto);
const estado = await reanudarTarea(proyecto, values.tarea, values.respuesta);
process.exit(estado.estado === "completada" ? 0 : 2);

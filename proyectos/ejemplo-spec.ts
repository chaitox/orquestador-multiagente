import { defineProyecto } from "../src/tipos.js";

/**
 * Spec-driven: un agente produce la especificación (sin tocar código) y los de
 * implementación trabajan contra ella, citando ids de tarea que se validan.
 */
export default defineProyecto({
  nombre: "spec-demo",
  raiz: "~/dev/demo",
  agentePrincipal: "spec",

  spec: {
    dir: "specs/{feature}",
    archivoTareas: "tareas.md",
    agente: "spec",
  },

  agentes: [
    {
      id: "spec",
      descripcion:
        "Escribe la especificación: requisitos, diseño y tareas. NO toca código — si algo no está definido, pregunta.",
      raiz: "specs",
      modelo: "opus",
      prompt: "spec/spec.md",
      // Lee el código para no especificar contra un sistema imaginario, pero no escribe ahí
      lecturaExtra: ["api", "web"],
      contrato: {
        requiereCambiosEn: ["{feature}/requisitos.md", "{feature}/tareas.md"],
        mensajeRechazo: "Una spec sin requisitos y sin tareas no es una spec.",
      },
    },
    {
      id: "api",
      descripcion: "Backend. Implementa las tareas de la spec; no decide lo que la spec no dice.",
      raiz: "api",
      prompt: "spec/api.md",
      lecturaExtra: ["specs"],
      verificacion: ["npm run build", "npm test"],
      contrato: { requiereCambiosEn: ["docs/{feature}/**"] },
    },
    {
      id: "web",
      descripcion: "Front. Implementa las tareas de la spec contra el contrato del backend.",
      raiz: "web",
      prompt: "spec/web.md",
      lecturaExtra: ["specs", "api/docs"],
      verificacion: ["npm run lint", "npm run build"],
    },
  ],

  reglasEscalada: [
    "La spec manda. Si la spec no lo dice, no lo decidas vos: preguntar o no_se_puede.",
    "Si al implementar descubrís que la spec está mal, pará. Cambiar la spec es una decisión, no una corrección.",
  ],
});

import { defineProyecto } from "../src/tipos.js";

export default defineProyecto({
  nombre: "interfaz",
  raiz: ".",
  agentePrincipal: "spec",
  modeloPorDefecto: "sonnet",
  maxTurnos: 150,

  spec: { dir: "specs/{feature}", archivoTareas: "tareas.md", agente: "spec" },
  preguntas: { canal: "consola", timeoutMin: 45, fase0: true },

  agentes: [
    {
      id: "spec",
      descripcion: "Escribe la especificación de la interfaz. No toca código.",
      raiz: "specs",
      modelo: "opus",
      maxTurnos: 80,
      prompt: "interfaz/spec.md",
      lecturaExtra: ["src", "servidor", "web", "MANUAL-WEB.md"],
      plantilla: { tipo: "custom", comandos: ["mkdir -p {nombre}"] },
      contrato: { requiereCambiosEn: ["{feature}/requisitos.md", "{feature}/tareas.md"] },
    },
    {
      id: "servidor",
      descripcion: "API local de solo lectura sobre .orquestador/, proyectos/ y decisiones.md. Dueño del contrato.",
      raiz: "servidor",
      prompt: "interfaz/servidor.md",
      lecturaExtra: ["specs", "src"],
      plantilla: { tipo: "node-ts" },
      verificacion: ["npx tsc --noEmit"],
      recursos: ["estado-orquestador"],
      contrato: { requiereCambiosEn: ["docs/{feature}/**"] },
    },
    {
      id: "web",
      descripcion: "Interfaz en React + Vite. Consume la API del servidor.",
      raiz: "web",
      prompt: "interfaz/web.md",
      lecturaExtra: ["specs", "servidor/docs"],
      plantilla: { tipo: "react-vite" },
      verificacion: ["npm run build"],
    },
  ],

  reglasEscalada: [
    "La interfaz no coordina: muestra y recibe respuestas. El orquestador manda.",
    "Nada de lanzar tareas desde la web.",
  ],
});

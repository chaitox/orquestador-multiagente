import { defineProyecto } from "../src/tipos.js";

/**
 * Ejemplo con TRES agentes en repos separados.
 * Podés poner los que quieras: uno por cada parte del sistema.
 */
export default defineProyecto({
  nombre: "pedidos",
  raiz: "~/dev/pedidos", // base para las rutas relativas de abajo
  agentePrincipal: "app",
  modeloPorDefecto: "sonnet",

  maxSolicitudes: 6,
  maxIntentosVerificacion: 2,

  // Si la solicitud menciona algo de esto, te pide aprobación por consola
  sensibles: [/precio/i, /pago/i, /factura/i],

  git: {
    estrategia: "rama-por-tarea",
    prefijoRama: "agente/",
    commitAlCerrar: true,
    exigirLimpio: true,
  },

  agentes: [
    {
      id: "app",
      descripcion: "App interna en Flutter Web (carga de pedidos, preparación, caja)",
      raiz: "pedidos-app",
      modelo: "sonnet",
      prompt: "ejemplo-pedidos/app.md",
      lecturaExtra: ["pedidos-api/docs"], // lee el contrato, no lo escribe
      verificacion: ["flutter analyze", "flutter test"],
      // Si la carpeta no existe, `npm run init` la crea con el generador oficial
      plantilla: { tipo: "flutter", opciones: ["--platforms", "web"] },
    },
    {
      id: "api",
      descripcion: "Backend NestJS + Prisma + PostgreSQL",
      raiz: "pedidos-api",
      modelo: "opus", // el que toma las decisiones delicadas
      prompt: "ejemplo-pedidos/api.md",
      verificacion: ["npm run build", "npm test -- --passWithNoTests"],
      plantilla: {
        tipo: "nestjs",
        postInstalacion: ["npm i -D prisma@latest", "npm i @prisma/client@latest", "npx -y prisma init"],
      },
      contrato: {
        requiereCambiosEn: ["docs/{feature}/**"],
        mensajeRechazo:
          "Rechazado: no actualizaste docs/{feature}/. Esos docs son el contrato que consume el front; " +
          "la tarea no está terminada sin ellos.",
      },
    },
    {
      id: "portal",
      descripcion: "Portal web del cliente en Next.js (pedidos online)",
      raiz: "pedidos-portal",
      modelo: "haiku", // trabajo más mecánico: modelo más barato
      prompt: "ejemplo-pedidos/portal.md",
      lecturaExtra: ["pedidos-api/docs"],
      verificacion: ["npm run lint", "npm run build"],
      plantilla: { tipo: "nextjs" },
    },
  ],
});

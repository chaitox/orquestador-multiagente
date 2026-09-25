import { defineProyecto } from "../src/tipos.js";

/**
 * Ejemplo MONOREPO: los dos agentes comparten el mismo repo git,
 * pero cada uno solo puede escribir en su carpeta.
 * Stack: API en Python (FastAPI) + front en React/Vite.
 */
const REPO = "~/dev/plataforma";

export default defineProyecto({
  nombre: "plataforma",
  raiz: REPO,
  agentePrincipal: "web",
  modeloPorDefecto: "sonnet",

  git: {
    estrategia: "rama-por-tarea",
    prefijoRama: "feat/",
    commitAlCerrar: true,
    exigirLimpio: true,
  },

  agentes: [
    {
      id: "web",
      descripcion: "Front en React + Vite + TanStack Query",
      raiz: "apps/web",
      repo: REPO, // mismo repo que el otro agente
      prompt: "ejemplo-python-react/web.md",
      lecturaExtra: ["apps/api/openapi.json"],
      verificacion: ["npm run typecheck", "npm run lint"],
      plantilla: { tipo: "react-vite" },
    },
    {
      id: "api",
      descripcion: "API en Python (FastAPI + SQLAlchemy + Alembic)",
      raiz: "apps/api",
      repo: REPO,
      modelo: "opus",
      prompt: "ejemplo-python-react/api.md",
      verificacion: ["uv run ruff check .", "uv run pytest -q"],
      plantilla: { tipo: "fastapi" },
      contrato: {
        // Acá el contrato es el OpenAPI regenerado, no una carpeta de docs
        requiereCambiosEn: ["openapi.json"],
        mensajeRechazo:
          "Rechazado: no regeneraste openapi.json. Corré 'python -m scripts.export_openapi' y volvé a cerrar.",
      },
      bashProhibido: [/alembic\s+downgrade/],
    },
  ],
});

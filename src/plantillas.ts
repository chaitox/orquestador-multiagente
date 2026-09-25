import type { TipoPlantilla } from "./tipos.js";

export interface Receta {
  /** Binarios que tienen que estar instalados */
  requiere: string[];
  /** Cómo verificar la versión instalada (informativo) */
  versionCmd?: string;
  /** Cómo actualizar el SDK local a la última versión (con `--actualizar`) */
  actualizarCmd?: string;
  /**
   * Comandos que crean la carpeta. Se corren en el DIRECTORIO PADRE.
   * {nombre} = carpeta del agente. Los generadores van pineados a @latest.
   */
  crear: string[];
  /** Comandos dentro del proyecto ya creado */
  post?: string[];
  /** Verificación sugerida para el config (se imprime al final del init) */
  verificacionSugerida: string[];
  notas?: string;
}

export const RECETAS: Record<Exclude<TipoPlantilla, "custom">, Receta> = {
  flutter: {
    requiere: ["flutter"],
    versionCmd: "flutter --version",
    actualizarCmd: "flutter upgrade",
    // El SDK sale de tu máquina: el init avisa si hay una versión más nueva.
    crear: ["flutter create {nombre}"],
    post: ["flutter pub get"],
    verificacionSugerida: ["flutter analyze", "flutter test"],
    notas: "Para Flutter Web puro: opciones: ['--platforms', 'web'].",
  },

  nestjs: {
    requiere: ["npx"],
    versionCmd: "node --version",
    crear: ["npx -y @nestjs/cli@latest new {nombre} --package-manager npm --skip-git"],
    verificacionSugerida: ["npm run build", "npm test -- --passWithNoTests"],
    notas: "Agregá Prisma con postInstalacion: ['npm i -D prisma@latest', 'npx prisma init'].",
  },

  nextjs: {
    requiere: ["npx"],
    versionCmd: "node --version",
    crear: [
      'npx -y create-next-app@latest {nombre} --ts --app --tailwind --eslint --src-dir --import-alias "@/*" --use-npm --yes',
    ],
    verificacionSugerida: ["npm run lint", "npm run build"],
  },

  "react-vite": {
    requiere: ["npm"],
    versionCmd: "node --version",
    crear: ["npm create vite@latest {nombre} -- --template react-ts"],
    post: ["npm install"],
    verificacionSugerida: ["npm run build"],
  },

  "node-ts": {
    requiere: ["npm"],
    versionCmd: "node --version",
    crear: ["mkdir -p {nombre}"],
    post: [
      "npm init -y",
      "npm i -D typescript@latest tsx@latest @types/node@latest",
      "npx tsc --init --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --outDir dist",
    ],
    verificacionSugerida: ["npx tsc --noEmit"],
  },

  fastapi: {
    requiere: ["uv"],
    versionCmd: "uv --version",
    actualizarCmd: "uv self update",
    // uv resuelve Python y dependencias con las últimas versiones compatibles
    crear: ["uv init {nombre}"],
    post: ["uv add fastapi 'uvicorn[standard]' sqlalchemy alembic", "uv add --dev pytest ruff"],
    verificacionSugerida: ["uv run ruff check .", "uv run pytest -q"],
    notas: "Si no tenés uv: https://docs.astral.sh/uv/ (o cambiá la receta a venv + pip).",
  },

  django: {
    requiere: ["uv"],
    versionCmd: "uv --version",
    crear: ["uv init {nombre}"],
    post: ["uv add django", "uv add --dev pytest pytest-django ruff", "uv run django-admin startproject config ."],
    verificacionSugerida: ["uv run python manage.py check", "uv run pytest -q"],
  },

  "python-lib": {
    requiere: ["uv"],
    versionCmd: "uv --version",
    crear: ["uv init --lib {nombre}"],
    post: ["uv add --dev pytest ruff"],
    verificacionSugerida: ["uv run ruff check .", "uv run pytest -q"],
  },
};

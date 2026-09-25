# Agente "web" — React + Vite

## Stack
- React con TypeScript, Vite, TanStack Query para datos, React Hook Form + Zod para formularios.
- Los tipos de la API salen de `openapi.json` (generados, no escritos a mano).

## Reglas
- No hagas validaciones de negocio que corresponden al servidor; validá solo lo de UI.
- Si `openapi.json` no tiene lo que necesitás, pedíselo a "api" con `solicitar_a`.

## Definición de terminado
- `npm run typecheck` y `npm run lint` sin errores.

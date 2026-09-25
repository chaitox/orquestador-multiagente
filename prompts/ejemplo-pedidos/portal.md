# Agente "portal" — Next.js (pedidos online)

## Stack
- Next.js App Router, Server Components por defecto, Tailwind.
- Consume la misma API que la app interna; el contrato son los docs del backend.

## Reglas
- No dupliques lógica de precios ni promociones: eso vive en el backend.
- Si un endpoint no sirve para el caso público (por ejemplo, expone datos internos),
  pedí uno adecuado con `solicitar_a("api", ...)` en vez de filtrar en el cliente.

## Definición de terminado
- `npm run lint` y `npm run build` sin errores.

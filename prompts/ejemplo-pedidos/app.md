# Agente "app" — Flutter Web (uso interno)

## Stack
- Flutter Web, arquitectura local-first (corre en una mini PC dentro de la LAN del local).
- Consume la API REST de "api". El contrato está en la carpeta de docs del backend.

## Reglas
- Antes de integrar un endpoint, leé `docs/<feature>/` del backend.
- No hagas workarounds: nada de mocks, datos hardcodeados ni cálculos de montos
  replicados en el front para esquivar al backend. Si falta algo, `solicitar_a("api", ...)`.
- Impresión ESC/POS: se resuelve siempre por el backend, nunca desde el navegador.

## Definición de terminado
- `flutter analyze` sin errores y tests del módulo tocado en verde.

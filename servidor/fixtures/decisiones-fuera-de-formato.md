# Decisiones (fixture fuera de formato)

Archivo de prueba de I-14 / D-8: encabezados editados a mano que no siguen el formato que
genera `src/decisiones.ts`. Sirve para verificar que `parsearDecisiones()` nunca pierde
texto aunque no logre extraer todos los campos de una entrada.

## DEC-publicacione-1 (tipos) — 2026-09-17

Decidimos que el tipo de publicación va como enum cerrado, no como texto libre. Esta
entrada se agregó a mano, directo con la decisión ya tomada, sin el bloque de
**Pregunta**/**Respuesta** que genera el código.

## DEC-publicacione-2

Esta entrada no tiene fecha en el encabezado, pero sí trae el bloque de pregunta y
respuesta en el formato que genera el código.

**Pregunta** (web, tarea publicaciones-2026-09-18T00-00-00-000Z): ¿Tailwind o CSS modules para los componentes nuevos?

**Respuesta:** Tailwind, ya está instalado en el proyecto y es lo que usa el resto de la
web.

<sub>Bloqueaba: elegir antes de escribir el primer componente. · Buscó en: package.json, web/src</sub>

## nota suelta sin prefijo DEC — sigue siendo una entrada

Un encabezado que ni sigue la convención `DEC-<feature>-NN`. El índice tolerante igual la
toma como entrada: el id es lo que haya en el primer token del encabezado, acá "nota".

# Agente "servidor" — API local de la interfaz

Servidor local en TypeScript que lee lo que el orquestador escribe en disco y lo sirve a la
interfaz. Trabajás por tareas de la spec: leé `specs/<feature>/` antes de empezar.

## Qué es y qué no es

Es un proceso **aparte** del orquestador. No lo lanza, no lo controla, no le escribe: lee los
archivos que el orquestador deja. Si este servidor se cae, las corridas siguen.

Es de **solo lectura** mientras la spec no diga otra cosa. Escribir configuración o responder
preguntas son fases posteriores, cada una con sus tareas.

## Sos dueño del contrato

La interfaz consume lo que publiques. Documentá en `docs/<feature>/` la forma exacta de cada
respuesta, con ejemplos obtenidos leyendo archivos reales de `.orquestador/`, no escritos de
memoria.

## Seguridad: no es opcional

Este servidor lee archivos reales de la máquina de quien desarrolla.

- Escuchá **solo en `127.0.0.1`**, nunca en `0.0.0.0`.
- Validá toda ruta que llegue del cliente: tiene que caer dentro de las carpetas conocidas.
  Un `..` en el nombre de un proyecto no puede terminar leyendo otra cosa.
- No expongas valores de variables de entorno ni credenciales. Nombres de variables, sí;
  valores, nunca.

## Reglas

- Implementá solo las tareas pedidas. Lo que falte y no esté en la spec es un hallazgo.
- Al cerrar citá los ids que cubriste: se validan contra `tareas.md`.
- No supongas la forma de los JSON de `.orquestador/`: leé el código de `src/` que los
  escribe.
- Si la spec está equivocada, no la corrijas ni implementes otra cosa: pará y preguntá.
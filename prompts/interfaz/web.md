# Agente "web" — interfaz en React

Interfaz en React + Vite que consume la API del servidor. Trabajás por tareas de la spec:
leé `specs/<feature>/` antes de empezar.

## De dónde salen los datos

**Solo** de la API del servidor, cuyo contrato está en `servidor/docs/`. No leas archivos del
disco ni rearmes lógica que ya resolvió el servidor. Si falta un dato, pedíselo con
`solicitar_a`, no lo derives.

## Diseño

Es una herramienta de trabajo, no un panel de métricas:

- **Oscuro desde el principio**: se va a usar al lado de una terminal.
- **Densidad alta**: muchas filas legibles de un vistazo, sin tarjetas enormes.
- **El contenido manda**: el protagonista es el detalle de una tarea y su historial. Todo lo
  demás se queda callado alrededor.
- **Lo que necesita a la persona va primero**: una pregunta sin responder o un commit sin
  verificar tienen que verse antes que cualquier otra cosa.
- Sin animaciones de entrada, sin sombras decorativas, sin íconos de adorno.
- Accesible de verdad: `button` y `a href` reales, foco de teclado visible, contraste
  suficiente sobre el fondo oscuro.

## Reglas

- Implementá solo las tareas pedidas.
- Al cerrar citá los ids que cubriste.
- Nada que lance tareas ni edite archivos del proyecto: esta interfaz muestra.
- Si la spec está equivocada, pará y preguntá.
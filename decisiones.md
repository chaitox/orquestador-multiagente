# Decisiones

Respuestas a preguntas de los agentes. Cada una tiene id y fecha,
y se cita en los reportes. Lo que no está acá, no pasó.

## DEC-lectura-01 — 2026-10-01

**Pregunta** (spec, tarea lectura-2026-10-01T12-14-16-475Z): MANUAL-WEB.md no existe: no está en la raíz del repo, ni en ninguna subcarpeta, ni en el historial de git (`git log --all -- MANUAL-WEB.md` no devuelve nada), aunque proyectos/interfaz.ts lo declara como lecturaExtra y mi prompt dice que es el plan que define las fases. ¿Existe en otro lado y me lo pasás, o especifico la fase 1 usando solo el alcance que me diste en la tarea (proyectos, tareas de un proyecto, detalle de una tarea con su historial, decisiones)?

**Respuesta:** El manual existe pero no estaba en el repo: lo acabo de guardar como MANUAL-WEB.md en la raíz. Leelo antes de especificar: define las cuatro fases, los endpoints de la fase 1, las reglas de seguridad y lo que no hay que construir.

<sub>Bloqueaba: El manual es la fuente del alcance de cada fase. Sin él no puedo saber qué queda deliberadamente fuera de la fase 1 ni qué estructura ya decidiste, y cualquier recorte que invente yo choca después con las fases siguientes. · Buscó en: proyectos/interfaz.ts, MANUAL.md</sub>

## DEC-lectura-02 — 2026-10-01

**Pregunta** (spec, tarea lectura-2026-10-01T12-14-16-475Z): El manual dice que la pantalla de Proyectos lleva "uno por archivo de `proyectos/`", pero en disco los dos conjuntos no coinciden: `.orquestador/inmobiliaria/` tiene 41 tareas y su raíz tiene un decisiones.md largo, y sin embargo no existe `proyectos/inmobiliaria.ts`; al revés, ejemplo-pedidos / ejemplo-python-react / ejemplo-spec sí tienen config pero cero tareas corridas y sus raíces (~/dev/pedidos, ~/dev/demo) ni siquiera existen. Si listo solo los archivos de `proyectos/`, la interfaz no muestra casi ninguno de los datos reales que hay. ¿Qué listo?

**Respuesta:** La unión, como proponés.

Un apunte que explica lo que encontraste: esta copia del repo no tiene proyectos/inmobiliaria.ts porque el orquestador que corre la inmobiliaria es otra copia, en otra carpeta. El historial de .orquestador/ quedó acá de corridas viejas. O sea que el caso "tareas sin config" no es raro: va a pasar siempre que alguien mueva o renombre un proyecto, y la interfaz tiene que mostrarlo igual.

Para cada caso:
- Con config y con tareas: todo.
- Con tareas y sin config: las tareas y su detalle, sin decisiones, y en pantalla una línea que diga que no se encontró su configuración. No lo escondas.
- Con config y sin tareas: el proyecto en cero, con sus agentes.

Y si la raíz declarada en el config no existe en disco, como pasa con los proyectos de ejemplo, decilo también en vez de fallar: es el mismo tipo de dato útil.

<sub>Bloqueaba: Define qué devuelve GET /api/proyectos y, en cascada, si /tareas y /decisiones tienen que funcionar para un proyecto sin archivo de config (sin config no hay `raiz` resuelta, y sin `raiz` no sé dónde está su decisiones.md: el de inmobiliaria vive fuera de este repo). Las dos lecturas dan implementaciones distintas en el servidor y pantallas distintas en la web. · Buscó en: MANUAL-WEB.md, src/config.ts</sub>

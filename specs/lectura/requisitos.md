# Fase 1 — Interfaz de solo lectura · Requisitos

Qué tiene que pasar, en términos observables. El cómo está en [diseño.md](./diseño.md);
el trabajo repartido, en [tareas.md](./tareas.md).

Alcance tomado de `MANUAL-WEB.md` §3 "Fase 1 — Solo lectura".

## Contexto

Todo lo que esta interfaz muestra ya existe en disco y lo escribe el orquestador. La fase 1
no cambia una línea de `src/`, no lanza nada y no escribe ningún archivo del proyecto.

## Qué queda explícitamente fuera

No se especifica acá, y ninguna tarea de esta feature puede empezarlo:

- Seguimiento en vivo, SSE, auto-refresco o logs por turno → fase 2.
- Responder preguntas o aprobar solicitudes desde la web → fase 3.
- Crear o editar proyectos, prompts o configuración → fase 4.
- Lanzar tareas, editar specs o editar decisiones desde la web → `MANUAL-WEB.md` §8: no se
  construye nunca.
- `.orquestador/herramientas.log`: el manual no lo incluye en los endpoints de la fase 1.

---

## R-01 · Inventario de proyectos

La persona ve la lista de todos los proyectos de los que hay algo que mirar.

Un proyecto entra en la lista si tiene archivo en `proyectos/` **o** carpeta en
`.orquestador/`, o ambos (decisión **DEC-lectura-02**). Los tres casos se muestran, ninguno
se esconde:

| Caso | Qué se ve |
| --- | --- |
| Config y tareas | Todo |
| Tareas sin config (proyecto movido o renombrado) | Sus tareas y su detalle, sin decisiones, y un aviso visible de que no se encontró su configuración |
| Config sin tareas | El proyecto en cero, con sus agentes |

Por cada proyecto se ve: nombre, cantidad de tareas corridas, costo acumulado en USD, fecha
de la última tarea, y los ids de sus agentes cuando hay config.

**Observable:** con el disco actual de este repo, la lista incluye `inmobiliaria` (41 tareas,
sin config), `interfaz` y `prueba` (config y tareas), y `ejemplo-pedidos`,
`ejemplo-python-react` y `ejemplo-spec` (config, cero tareas).

## R-02 · Detalle de un proyecto

Para un proyecto con config se ve su configuración resuelta: raíz, modelo por defecto, topes
(solicitudes, turnos, intentos de verificación), estrategia de git, canal de preguntas, si es
spec-driven, y por cada agente su id, descripción, carpeta, repo, modelo, lecturas extra,
comandos de verificación, recursos y contrato.

Esa lista es cerrada, no un "todo el config": los dos campos `RegExp` que el config admite
—`sensibles` del proyecto y `bashProhibido` del agente— **no se muestran**, y no es una omisión
por descuido (ver la rama tomada en el Contrato HTTP de [diseño.md](./diseño.md)).

Si la raíz declarada en el config no existe en disco (pasa con los proyectos de ejemplo), se
dice en pantalla en vez de fallar (**DEC-lectura-02**).

Si no hay config, el detalle no falla: informa que no se encontró y deja ver las tareas igual.

## R-03 · Tareas de un proyecto

La persona ve la lista de tareas corridas de un proyecto, de la más reciente a la más vieja.

Por cada tarea: feature, descripción, estado (`en_curso`, `completada`, `detenida`,
`aparcada`), motivo cuando lo hay, costo, cuántas solicitudes entre agentes hubo, y la fecha.

Una tarea `aparcada` o `detenida` se distingue de un vistazo de una `completada`: es lo que
necesita a la persona.

## R-04 · Detalle de una tarea con su historial

El contenido protagonista. Se ve, para una tarea:

- **Cabecera**: feature, descripción completa, estado y motivo, costo, cantidad de
  solicitudes, sesiones por agente, ramas por repo, repos participantes.
- **Historial completo en orden**, cada evento con su fecha y su detalle legible: inicio,
  solicitud, solicitud rechazada, entrega, preguntas con su respuesta, verificación fallida,
  corte de red, rescate, recordatorio de cierre, agente completo, aparcada, detenida,
  completada. "Legible" es lo que el evento guardó y nada más: de una verificación fallida se ve
  el comando, el intento y si era reintentable, **no la salida del comando**, porque el
  orquestador no la escribe en el estado (ver D-9). De seis de los trece el detalle es un texto
  suelto, no un objeto con campos.
- **Pregunta pendiente**: si la tarea quedó aparcada esperando una respuesta, se ve la
  pregunta con su `porQue`, su `dondeBusque`, sus opciones y su recomendación. Se muestra;
  no se contesta desde acá (eso es fase 3). Esos campos viven anidados dentro de
  `pendiente.pregunta`, no al tope de `pendiente` (ver D-10).

**Observable:** abrir `inmobiliaria / publicaciones-2026-09-23T16-34-01-763Z` muestra los 3
eventos de su historial, US$ 6.42 y las 3 ramas de sus repos.

## R-05 · Decisiones de un proyecto

Se ve el `decisiones.md` del proyecto renderizado, con un buscador que filtra por texto.

Las entradas quedan identificables por su id (`DEC-<feature>-NN`) para poder citarlas. Un
`decisiones.md` editado a mano, con encabezados que no siguen el formato que genera
`src/decisiones.ts`, se muestra igual y completo: el buscador puede degradarse, el contenido
nunca se pierde.

Un proyecto sin config no tiene raíz que resolver y por lo tanto no tiene decisiones: se dice
con esas palabras, no con un error. Un proyecto con config y sin `decisiones.md` muestra un
vacío explicado, tampoco un error.

**Lo que el disco ya no da** (encontrado al implementar `I-06`): el caso "config, raíz existente
y sin `decisiones.md`" dejó de existir en este repo. `prueba` lo cubría hasta que una corrida
real escribió `/tmp/prueba-orq/decisiones.md` el 2026-10-01 a las 08:49, y de los cinco
proyectos con config no queda ninguno que lo cumpla: `interfaz` y `prueba` tienen su
`decisiones.md`, y los tres `ejemplo-*` tienen la raíz inexistente. El requisito no cambia —esa
rama se sigue pidiendo—; lo que cambia es con qué se verifica, y va por `I-16` (D-11).

## R-06 · Nada de esto escribe

Mientras corre la interfaz, ningún archivo del repo ni de las raíces de los proyectos cambia.
La API no expone ningún verbo que modifique, y la web no tiene ningún control que lo intente.

**Observable:** con la interfaz abierta y navegada por todas las pantallas, `git status` sigue
limpio y la fecha de modificación de los archivos de `.orquestador/` no cambia.

Las dos mitades de ese observable no son redundantes y conviene no confundirlas: `.orquestador`
está en `.gitignore`, así que **`git status` no ve nada de lo que pase ahí adentro**. Lo que
prueba que la interfaz no escribió el estado es la comparación de fechas de modificación; el
`git status` cubre el resto del repo.

## R-07 · La interfaz no estorba a las corridas

El servidor es un proceso aparte: no lanza el orquestador, no lo controla y no le escribe.
Si se cae, una corrida en curso sigue sin enterarse. Si una corrida está escribiendo mientras
la interfaz lee, la interfaz puede mostrar datos de hace un segundo o un archivo a medio
escribir, pero no se rompe ni rompe la corrida.

## R-08 · Seguridad

De `MANUAL-WEB.md` §5, todas obligatorias:

- El servidor escucha **solo en `127.0.0.1`**. Nunca en `0.0.0.0`.
- Un nombre de proyecto o un id de tarea que venga del navegador no puede hacer que se lea un
  archivo fuera de las carpetas conocidas. `../../` en cualquiera de los dos parámetros no
  llega a `~/.ssh`.
- No se expone el `.env` ni ningún valor de variable de entorno. Nombres, sí; valores, nunca.
- Solo lectura: no hay endpoint que escriba.

## R-09 · Tolerancia a los datos reales

Los JSON de `.orquestador/` fueron escritos por versiones distintas del orquestador y no
tienen todos los mismos campos: los de septiembre no tienen `reposParticipantes`, y ninguno
de los que están en disco tiene `pendiente`. Un campo ausente, un JSON corrupto o un evento de
historial con un nombre que la interfaz no conoce se muestran como lo que hay, sin romper la
pantalla ni la lista entera.

**Observable:** la lista de tareas de `inmobiliaria` carga completa aunque ninguno de sus 41
archivos tenga `reposParticipantes`.

De estos casos, los que **no están** en el disco de este repo son: una tarea `aparcada`, una con
`pendiente`, una con historial vacío, un JSON inválido y un evento de historial con un nombre
fuera de la lista de D-9. Se verifican con los fixtures de **D-11**, y nunca editando ni
corrompiendo un archivo real de `.orquestador/`: no están versionados, así que lo que se rompe
ahí no se recupera.

Tampoco hay en disco un ejemplo de cuatro de los trece eventos que D-9 declara y que R-04 pide
mostrar: `solicitud_rechazada`, `verificacion_fallida`, `corte_de_red` y
`recordatorio_de_cierre`. Los ocho que sí aparecen son `inicio`, `solicitud`, `entrega`,
`preguntas`, `rescate`, `agente_completo`, `detenida` y `completada`; el noveno, `aparcada` como
evento, lo aporta el fixture de la tarea aparcada. Los cuatro que faltan van por fixture
también (`I-15`): un criterio que nombra un evento del que no hay un solo dato en disco no se
puede verificar.

Al preparar `I-15` apareció el otro lado del mismo problema: un criterio puede nombrar un **campo**
que no existe, y entonces el fixture es lo que lo inventa. `I-11` pedía ver la salida del comando
de una `verificacion_fallida`, y el orquestador no la guarda (D-9). Un fixture escrito desde el
criterio en vez de desde el código la habría agregado, el criterio habría pasado, y la pantalla
habría quedado vacía con los datos reales. De ahí la regla de `I-15`: la forma del `detalle` se
copia del `registrar()` que la escribe, y si no coincide con lo que pide un criterio, lo que se
corrige es el criterio.

Esa regla ya atrapó un caso con el fixture **puesto**, no solo con el criterio: el fixture de la
tarea aparcada de `I-14` escribe el evento `aparcada` con un `detalle` de objeto
(`{ motivo, pregunta }`) y el orquestador lo escribe como string pelado, el id de la pregunta
(`src/orquestador.ts:148`, y D-9 lo lista entre los seis de string). Una pantalla construida
contra ese fixture habría mostrado una tabla de campos que con datos reales queda vacía —el mismo
modo de falla, en el mismo evento que `I-11` usa para verificar el caso aparcada—. Se corrige en
`I-15`. La conclusión que vale para lo que queda: un fixture no es correcto porque haga pasar el
criterio, sino porque coincide con el código que escribe el dato, y eso se revisa evento por
evento.

Al implementar `I-06` se sumó a esa lista un caso más, de decisiones y no de tareas: un proyecto
con config, raíz existente y sin `decisiones.md` (ver R-05). Estaba en disco cuando se escribió
la spec y dejó de estar, porque una corrida real escribió el archivo que faltaba. **El disco es
un blanco móvil** —ya había pasado con los contadores de tareas de **DEC-lectura-02**—, así que
un criterio que cita una foto del disco se escribe nombrando la propiedad que necesita y cómo
volver a buscarla, no solo el número o el proyecto que la cumplía ese día. Un criterio que cita
un proyecto por nombre y además depende de que a ese proyecto le *falte* un archivo es el que
caduca más rápido: lo que falta se crea solo.

## R-10 · Estados de carga, vacío y error

Toda pantalla distingue tres situaciones y las dice con palabras distintas: está cargando, no
hay nada que mostrar, o algo falló (y qué). Un proyecto que no se puede leer no deja en blanco
la pantalla de los demás.

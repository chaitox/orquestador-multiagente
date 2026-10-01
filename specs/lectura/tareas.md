# Fase 1 — Interfaz de solo lectura · Tareas

Ids estables: no se renumeran, porque las entregas los citan. Cada tarea dice quién la
implementa y cuándo está hecha.

Referencias: [requisitos.md](./requisitos.md) · [diseño.md](./diseño.md)

**Orden.** `I-01` antes que el resto del servidor. `I-14` antes de `I-04`, `I-05` y `I-06`: son
los datos que esos criterios necesitan y que el disco no tiene. `I-07` antes de que la web toque
datos reales (`I-10` en adelante): es el contrato que la web lee. `I-08` puede ir en paralelo con
todo el servidor.

**Regla que vale para todos los criterios de esta feature.** Ninguno se verifica editando,
renombrando ni corrompiendo un archivo real de `.orquestador/`. Los casos que no están en disco
se montan con los fixtures de `I-14` (**D-11**). `.orquestador` está en `.gitignore`: lo que se
rompa ahí no vuelve con `git checkout`.

---

## Servidor

### I-01 · Servidor HTTP local de solo lectura

**Agente:** servidor

Proceso Node + TypeScript que escucha en `127.0.0.1` y sirve `/api/*`. Stack a elección entre
Fastify y el `http` de Node (`MANUAL-WEB.md` §2). Incluye el helper de resolución de rutas por
lista blanca de D-5 y el script de npm para arrancarlo.

**Criterio de aceptación**

- `npx tsc --noEmit` pasa.
- El servidor levantado responde en `http://127.0.0.1:<puerto>/api/proyectos` y **no** responde
  en la IP de red de la máquina (R-08).
- Un `POST`, `PUT` o `DELETE` a cualquier ruta devuelve `405`.
- Existe una función de resolución que, dado un nombre que no está en el inventario, devuelve
  "no encontrado" sin tocar el filesystem fuera de las carpetas conocidas; `..%2F..%2Fetc` como
  `:nombre` da `404` y no lee nada de afuera.
- El puerto y el comando para arrancar quedan escritos en `servidor/docs/lectura/`.

### I-02 · Inventario de proyectos — `GET /api/proyectos`

**Agente:** servidor · **Requisitos:** R-01, R-09 · **Diseño:** D-1, D-2, D-3

Unión de `proyectos/*.ts` y `.orquestador/<proyecto>/`, con el agregado por proyecto:
cantidad de tareas, costo acumulado, fecha de la última tarea e ids de agentes.

**Criterio de aceptación**

- Con el disco actual del repo y sin fixtures presentes, la respuesta incluye los seis
  proyectos: `inmobiliaria` (`tieneConfig: false`, 41 tareas), `interfaz` y `prueba` (config y
  tareas), y `ejemplo-pedidos`, `ejemplo-python-react`, `ejemplo-spec` (config, 0 tareas).
  Las 41 de `inmobiliaria` son un número fijo —ese proyecto corre en otra copia del repo
  (DEC-lectura-02) y acá no crece—, pero las de `interfaz` y `prueba` **suben con cada corrida**,
  incluida la de esta misma feature: para esos dos el criterio es la cantidad que haya en disco
  al momento de verificar, no un número escrito acá.
- Los **tres** proyectos de ejemplo aparecen con la marca de raíz inexistente —`~/dev/pedidos`,
  `~/dev/demo` y `~/dev/plataforma`, ninguna existe— y **no** hacen fallar el endpoint (D-3).
- El costo acumulado de `inmobiliaria` es la suma de los `costoEstimadoUsd` de sus 41 archivos:
  hoy `100.7706`. Si el número no da, el agregado está mal, no el criterio.
- Con un fixture de JSON inválido presente (`I-14`), ese proyecto sigue listado y el endpoint
  responde `200`.

### I-03 · Detalle de proyecto — `GET /api/proyectos/:nombre`

**Agente:** servidor · **Requisitos:** R-02, R-08 · **Diseño:** D-3, D-6

Config resuelta del proyecto y de cada agente, más las marcas de config/raíz faltante.

**Criterio de aceptación**

- `GET /api/proyectos/interfaz` devuelve sus tres agentes (`spec`, `servidor`, `web`) con
  carpeta, modelo resuelto, lecturas extra, verificaciones, recursos y contrato, y los topes
  del proyecto (`maxTurnos: 150`, spec-driven en `specs/{feature}`).
- `GET /api/proyectos/inmobiliaria` responde `200` diciendo que no se encontró configuración,
  no `404` (R-05, D-1).
- `GET /api/proyectos/ejemplo-pedidos` responde `200` con la marca de raíz inexistente.
- La respuesta no contiene ningún valor de variable de entorno ni nada del `.env` (R-08, D-6),
  y es JSON válido aunque el config traiga `RegExp` en `sensibles` o `bashProhibido`.

### I-04 · Tareas de un proyecto — `GET /api/proyectos/:nombre/tareas`

**Agente:** servidor · **Requisitos:** R-03, R-09 · **Diseño:** D-4, D-10

Lista ordenada de más reciente a más vieja, con feature, descripción, estado, motivo, costo,
cantidad de solicitudes y fechas.

**Criterio de aceptación**

- `GET /api/proyectos/inmobiliaria/tareas` devuelve las 41 entradas aunque ninguna tenga
  `reposParticipantes` (R-09).
- El primer elemento es la tarea con la fecha de inicio más alta, y esa fecha sale de
  `historial[0].fecha`, no del nombre del archivo (D-4).
- Una tarea con historial vacío aparece igual, fechada por el `mtime` del archivo (fixture de
  `I-14`: en disco no hay ninguna).
- Un archivo con JSON inválido aparece como entrada en error y las demás se devuelven normal
  (D-10), verificado sobre el fixture de `I-14` y no corrompiendo un JSON real.
- `GET /api/proyectos/noexiste/tareas` devuelve `404`.

### I-05 · Detalle de tarea — `GET /api/proyectos/:nombre/tareas/:id`

**Agente:** servidor · **Requisitos:** R-04, R-09 · **Diseño:** D-9, D-10

Estado completo: cabecera, historial en orden con el `detalle` de cada evento, y la pregunta
pendiente si la hay.

**Criterio de aceptación**

- `GET /api/proyectos/inmobiliaria/tareas/publicaciones-2026-09-23T16-34-01-763Z` devuelve
  estado `completada`, `costoEstimadoUsd` 6.4214, 3 ramas y los 3 eventos del historial
  (`inicio`, `agente_completo`, `completada`) con su `detalle` íntegro.
- Los campos ausentes en los JSON viejos (`reposParticipantes`, `pendiente`) vienen con valor
  neutro, no `undefined` suelto (D-10).
- Una tarea `aparcada` devuelve su `pendiente` con la pregunta completa: `porQue`,
  `dondeBusque`, `opciones` y `recomendacion`, **anidados bajo `pendiente.pregunta`** y sin
  aplanar (D-10). En disco no hay ninguna tarea así: se verifica con el fixture de `I-14`.
- Un `:id` que no corresponde a un archivo de esa carpeta devuelve `404` sin leer nada fuera
  de ella (D-5).

### I-06 · Decisiones — `GET /api/proyectos/:nombre/decisiones`

**Agente:** servidor · **Requisitos:** R-05 · **Diseño:** D-8

Markdown crudo completo más el índice de entradas parseado de forma tolerante.

**Criterio de aceptación**

- `GET /api/proyectos/interfaz/decisiones` devuelve el `decisiones.md` de la raíz del repo con
  las entradas `DEC-lectura-01` y `DEC-lectura-02` en el índice.
- El parseo tolerante, corrido sobre un markdown de muestra en `servidor/fixtures/` con
  encabezados fuera del formato de `src/decisiones.ts` (del tipo
  `## DEC-publicacione-1 (tipos) — 2026-09-17`), devuelve el texto entero: el markdown crudo no
  pierde ni un párrafo aunque el índice no logre extraer todos los campos. Se verifica con el
  fixture y no contra el `decisiones.md` de `inmobiliaria`, que vive en otra copia del repo y que
  la API no puede servir porque ese proyecto no tiene config (D-8, D-11).
- Proyecto sin config (`inmobiliaria`): `200` diciendo que no hay raíz que resolver, no `404`
  (R-05).
- Proyecto con config, raíz existente y sin `decisiones.md` (`prueba`, raíz `/tmp/prueba-orq`):
  `200` con contenido vacío, no `404`.
- Proyecto con config y raíz inexistente (`ejemplo-spec`): `200` que lo dice, no un `404` ni una
  excepción de filesystem.

### I-07 · Documentar el contrato en `servidor/docs/lectura/`

**Agente:** servidor · **Requisitos:** R-01 a R-05, R-08

El documento que la web consume. Cubre las cinco rutas con la forma exacta de cada respuesta,
los códigos de error, el puerto y cómo arrancar el servidor.

**Criterio de aceptación**

- Hay un ejemplo de respuesta por cada una de las cinco rutas, **obtenido ejecutando el
  servidor contra los archivos reales de `.orquestador/`**, no escrito de memoria.
- Está documentada la lista cerrada de eventos del historial (D-9) con la forma del `detalle`
  de cada uno, y dice qué hace la web con uno desconocido.
- Está documentado qué distingue un `404` de un `200` que informa "sin config" / "sin
  decisiones".
- Dice el puerto y el comando de arranque, para que la web configure su proxy (D-7).

### I-14 · Fixtures de los casos que no están en disco

**Agente:** servidor · **Requisitos:** R-09 · **Diseño:** D-11

Los datos de prueba de los casos que el disco de este repo no tiene. Los usan los criterios de
`I-02`, `I-04`, `I-05`, `I-06` y, del lado de la web, `I-10` e `I-11`. Va antes que esos.

Verificado sobre los 49 JSON que había en `.orquestador/` al escribir esta spec: ninguno está
`aparcada`, ninguno tiene `pendiente`, ninguno tiene historial vacío y ninguno es JSON inválido.
Una corrida futura podría dejar una tarea `aparcada` de verdad, pero ningún criterio depende de
que eso pase: para eso están los fixtures.

**Criterio de aceptación**

- Hay un fixture por cada uno de los cuatro casos: tarea `aparcada` con su `pendiente` completo
  (`pregunta` con `porQue`, `dondeBusque`, `opciones`, `recomendacion`, más `trabajo`, según
  `src/buzon.ts:77`), tarea con `historial: []`, archivo que no es JSON válido, y una tarea con
  un `evento` de nombre inventado que no está en la lista de D-9.
- Los fixtures de tareas viven en carpetas `.orquestador/fixture-<caso>/` y el fixture de
  markdown fuera de formato en `servidor/fixtures/`. **Ningún fixture modifica, renombra ni
  borra un archivo existente de `.orquestador/`** (D-11).
- Hay un comando documentado para montarlos y otro para borrarlos, y después de borrarlos
  `GET /api/proyectos` vuelve a devolver exactamente los seis proyectos de `I-02`.
- `servidor/docs/lectura/` dice qué caso cubre cada fixture y con qué criterio se corresponde, e
  incluye la respuesta de ejemplo del markdown fuera de formato: `I-12` la necesita para poder
  verificarse sin un proyecto real que la produzca.

---

## Web

### I-08 · Esqueleto React + Vite, layout oscuro y cliente de API

**Agente:** web · **Requisitos:** R-10 · **Diseño:** D-7

App Vite con el layout base (oscuro, denso, sin animaciones de entrada), navegación entre las
cuatro pantallas y un cliente de API que pide a `/api/...` relativo, con el proxy de Vite
apuntando al servidor.

**Criterio de aceptación**

- `npm run build` pasa.
- El cliente concentra en un solo lugar la distinción cargando / vacío / error, y las cuatro
  pantallas la usan (R-10).
- No hay ninguna URL absoluta con puerto escrita en el código de la web (D-7).
- Navegación con teclado: el foco se ve, y los controles son `button` y `a href` reales.

### I-09 · Pantalla de proyectos

**Agente:** web · **Requisitos:** R-01, R-10 · **Diseño:** D-1

Una fila por proyecto con nombre, agentes, tareas corridas, costo acumulado y fecha de la
última.

**Criterio de aceptación**

- Con el disco actual se ven los seis proyectos.
- `inmobiliaria` muestra en su fila el aviso de que no se encontró su configuración, no
  escondido en el detalle (R-01, DEC-lectura-02).
- Los tres `ejemplo-*` muestran el aviso de raíz inexistente (D-3).
- Un proyecto con 0 tareas se ve en cero, no desaparece.
- Click en un proyecto lleva a sus tareas.

### I-10 · Pantalla de tareas de un proyecto

**Agente:** web · **Requisitos:** R-03, R-10

Lista densa, más reciente arriba.

**Criterio de aceptación**

- Las 41 tareas de `inmobiliaria` se ven en una lista legible de un vistazo, sin tarjetas
  grandes.
- `aparcada` y `detenida` se distinguen de `completada` sin leer el texto, y su motivo está a
  la vista. Los cuatro estados de `EstadoGeneral` (`src/buzon.ts:62`) tienen su tratamiento:
  en disco hay `completada`, `detenida` y `en_curso` —`inmobiliaria` tiene de los tres— y
  `aparcada` se verifica con el fixture de `I-14`.
- Un proyecto con 0 tareas (`ejemplo-pedidos`) dice que no hay ninguna, distinto de un error.

### I-11 · Detalle de tarea con su historial

**Agente:** web · **Requisitos:** R-04, R-09, R-10 · **Diseño:** D-9

El contenido protagonista: cabecera, pregunta pendiente si la hay, e historial completo en
orden.

**Criterio de aceptación**

- Abrir `inmobiliaria / publicaciones-2026-09-23T16-34-01-763Z` muestra la descripción
  completa, US$ 6.42, las 3 ramas y los 3 eventos del historial.
- Los eventos de la lista de D-9 se presentan cada uno con su detalle legible: una `solicitud`
  muestra origen, destino, problema y esperado; una `entrega`, resumen, archivos y los ids de
  tareas citados; una `verificacion_fallida`, el comando y su salida; `preguntas`, cada
  pregunta con su respuesta.
- Un evento con un nombre fuera de esa lista se muestra genérico (fecha, nombre, detalle en
  crudo) y no rompe la vista (D-9), verificado con el fixture de evento desconocido de `I-14`.
- Si la tarea está aparcada, la pregunta pendiente aparece **antes** que el resto, completa
  (`porQue`, `dondeBusque`, opciones, recomendación, leídos de `pendiente.pregunta`) y **sin
  ningún control para responderla** (R-04: contestar es fase 3). Se verifica con el fixture de
  `I-14`, que es la única tarea `aparcada` disponible.

### I-12 · Pantalla de decisiones con buscador

**Agente:** web · **Requisitos:** R-05, R-10 · **Diseño:** D-8

Markdown renderizado y un campo que filtra entradas en el cliente.

**Criterio de aceptación**

- Las decisiones de `interfaz` se ven renderizadas, con `DEC-lectura-01` y `DEC-lectura-02`
  localizables por su id.
- Escribir en el buscador filtra entradas; vaciarlo las devuelve todas.
- Un `decisiones.md` con encabezados fuera de formato se ve completo igual, aunque el filtro
  no acierte todas sus entradas (D-8). Se verifica con la respuesta de ejemplo del fixture que
  `I-14` deja documentada en `servidor/docs/lectura/`: en este repo no hay ningún proyecto cuya
  raíz resuelva a un `decisiones.md` fuera de formato.
- Un proyecto sin config (`inmobiliaria`) muestra el texto de "no hay decisiones porque no se
  encontró su configuración", no un error ni una pantalla en blanco.
- No hay ningún control para editar: la pantalla solo muestra (R-06).

### I-13 · La web no escribe nada

**Agente:** web · **Requisitos:** R-06, R-07

Verificación de cierre de la feature.

**Criterio de aceptación**

- Con el servidor y la web levantados y las cuatro pantallas navegadas de punta a punta,
  `git status` en el repo sigue limpio y no cambia el `mtime` de ningún archivo de
  `.orquestador/`. Las dos comprobaciones hacen falta: `.orquestador` está en `.gitignore`, así
  que `git status` **no** ve lo que pase ahí (R-06). La comparación de `mtime` se toma antes y
  después de navegar, sobre todos los archivos de `.orquestador/`. Si hay una corrida del
  orquestador en curso mientras se verifica, sus propios archivos sí cambian: la comprobación se
  hace sin corridas activas, o se excluye la tarea en curso (R-07).
- La web no emite ningún request que no sea `GET` a `/api/*`.
- Matar el servidor mientras la web está abierta muestra el estado de error de R-10; volver a
  levantarlo deja la web usable sin recargar nada más que la vista.

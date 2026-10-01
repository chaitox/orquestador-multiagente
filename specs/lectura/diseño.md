# Fase 1 — Interfaz de solo lectura · Diseño

Cómo se construye lo de [requisitos.md](./requisitos.md), con las decisiones tomadas y las
alternativas descartadas.

## Forma general

```
navegador (React + Vite, puerto de Vite)
        │  fetch /api/*  → proxy de Vite
        ▼
servidor local (Node + TypeScript, 127.0.0.1)
        │  lee, nunca escribe
        ▼
proyectos/*.ts · .orquestador/<proyecto>/*.json · <raiz del proyecto>/decisiones.md
```

Dos procesos. El servidor no importa nada de `src/orquestador.ts` ni ejecuta tareas: solo
reusa lo que ya sabe leer config (`src/config.ts`) y los tipos del estado (`src/buzon.ts`).

---

## Decisiones

### D-1 · El inventario de proyectos es la unión de config y estado

**Decidido:** un proyecto existe para la interfaz si tiene `proyectos/<nombre>.ts` o
`.orquestador/<nombre>/`, y en pantalla se marca cuál de los dos le falta.

Viene de **DEC-lectura-02**. El motivo no es un caso de borde: el orquestador que corre un
proyecto puede vivir en otra copia del repo, y el historial queda acá. Pasa también cada vez
que alguien mueve o renombra un proyecto.

**Descartado:** listar solo los archivos de `proyectos/`, como dice literal el manual. Con el
disco real de este repo esconde `inmobiliaria`, que es el 90% de los datos que hay para mirar,
y muestra tres proyectos de ejemplo que nunca corrieron.

### D-2 · Se lee en cada pedido, sin caché

**Decidido:** cada request abre los archivos que necesita. Nada de caché en memoria, nada de
`fs.watch`.

El manual (§3) ya lo resuelve: son decenas de JSON de pocos KB. El costo real de una lista de
proyectos es leer los 41 JSON de `inmobiliaria` para sumar costos, y eso son milisegundos.

**Descartado:** cachear con invalidación por `mtime`. Un caché mal invalidado muestra una
tarea en curso congelada, que es exactamente el bug que la fase 2 va a venir a evitar.

### D-3 · La carga de un proyecto no puede tumbar la lista

Cargar `proyectos/<nombre>.ts` es un `import()` que **ejecuta** el archivo, y `resolver()` en
`src/config.ts:78` tira si la raíz del agente no existe (`exigirRaices`) o si falta su prompt.
Con el disco real, los **tres** proyectos de ejemplo apuntan a raíces que no existen:
`ejemplo-pedidos` a `~/dev/pedidos`, `ejemplo-spec` a `~/dev/demo` y `ejemplo-python-react` a
`~/dev/plataforma` (no existe ni `~/dev`). O sea que la raíz inexistente es el caso común entre
los proyectos de ejemplo, no la excepción de uno.

**Decidido:** se carga con `exigirRaices: false`, y aun así cada proyecto se carga dentro de su
propio `try`. Un proyecto que explota al cargar aparece en la lista con su error como dato, y
los demás cargan normal. Si la raíz resuelta no existe, se marca (`raizExiste: false`) en vez
de fallar — es el dato útil que pidió **DEC-lectura-02**.

**El cwd es parte del contrato de `cargarProyecto()`** (encontrado al implementar `I-02`/`I-03`).
`resolver()` resuelve las rutas relativas del config con `path.resolve()` contra `process.cwd()`
**en el momento en que corre**, no contra la constante `RAIZ_APP` que `src/config.ts` calcula al
importarse. Como el servidor arranca dentro de `servidor/`, sin corregirlo la `raiz: "."` de
`interfaz` resuelve a `servidor/` en vez de a la raíz del repo, y todo lo que cuelga de la raíz
—incluido el `decisiones.md` de `I-06`— sale apuntando al lugar equivocado **sin lanzar ningún
error**: es un valor plausible y mal, el peor modo de falla.

El servidor fija el cwd a la raíz del repo una sola vez al arrancar, antes de aceptar requests.
No se toca por llamada: el cwd es estado global del proceso y cambiarlo con requests concurrentes
en vuelo es una condición de carrera. Dos consecuencias para lo que falta: `I-04`, `I-05` e `I-06`
heredan la invariante y no la pueden revertir, y cualquier runner que ejecute esas funciones desde
otro directorio tiene que fijar el mismo cwd o va a leer rutas distintas que el servidor.

### D-4 · Las fechas salen del historial, no del nombre del archivo

El `tareaId` es `${feature}-${ISO}` (`src/buzon.ts:88`), y como una feature puede tener
guiones, partirlo para sacar la fecha es frágil.

**Decidido:** inicio = `historial[0].fecha`, fin = `historial[historial.length - 1].fecha`.
Si el historial está vacío, se usa el `mtime` del archivo. El `tareaId` queda como lo que es:
un identificador opaco, y el id de la URL.

### D-5 · Validación de rutas por lista blanca, no por saneo de strings

**Decidido:** `:nombre` se acepta solo si está en el inventario ya calculado; `:id` solo si
`<id>.json` figura en el `readdir` de esa carpeta. La comparación es contra nombres reales que
ya existen, no contra un string filtrado.

**Descartado:** sanear `..` y barras. Es una lista negra, y las listas negras de rutas se
escapan; además el `basename` normalizado todavía deja pasar nombres raros. Comparar contra lo
que existe no tiene ese problema. Como defensa en profundidad, además se verifica que la ruta
absoluta resuelta siga cayendo dentro del directorio esperado.

### D-6 · Variables de entorno: nada de valores

La API nunca lee `process.env` para responder. El único lugar donde un valor de entorno puede
colarse es una raíz del config que use `${VAR}` — `expandir()` en `src/config.ts:139` la
sustituye al resolver. Esa es una ruta de carpeta, se muestra como ruta y es lo que la persona
necesita ver; no se vuelve a leer la variable ni se expone el `.env`.

**La garantía es "no se lee para responder", no "no está cargado"** (precisado al verificar
`I-03`). Importar `src/config.ts` ejecuta `process.loadEnvFile()` en su línea 7, así que el
proceso del servidor **tiene el `.env` del repo cargado en `process.env`** desde el momento en
que resuelve el primer config. Hoy eso no se filtra —no hay un solo `process.env` en el código
del servidor, y se verificó que ningún valor del `.env` aparece en ninguna de las respuestas—,
pero la defensa es que nadie lo lea, no que no esté ahí. Cualquier endpoint de diagnóstico que
una fase posterior quiera agregar (volcar config, estado del proceso, versión) lo convierte en
una filtración sin que haga falta cambiar nada más.

### D-7 · La web no sabe en qué puerto está el servidor

**Decidido:** la web pide siempre a `/api/...` relativo, y Vite redirige `/api` al servidor en
desarrollo. El puerto lo elige el servidor y lo documenta en `servidor/docs/lectura/`; la web
lo lee de ahí para configurar el proxy (tiene `servidor/docs` en su `lecturaExtra`).

**Descartado:** una `VITE_API_URL` en la web. Agrega un `.env` más para mantener sincronizado
y el manual ya pide no multiplicar configuración.

### D-8 · Decisiones: markdown completo más un índice tolerante

El `decisiones.md` que genera `src/decisiones.ts:21` tiene un formato fijo
(`## <id> — <fecha>`, `**Pregunta** (<agente>, tarea <t>): …`, `**Respuesta:** …`), pero los
archivos reales se editan a mano y dejan de matchear.

**Ojo con lo que hay en este repo:** el único `decisiones.md` acá es el de la raíz, y está en
formato generado (es el que resuelve `interfaz`, con `raiz: "."`). El archivo de `inmobiliaria`,
que es el que está editado a mano, vive en la otra copia del repo (ver **DEC-lectura-02**) y
además `inmobiliaria` no tiene config, así que **no hay raíz que resolver y la API no lo sirve
nunca**. El parseo tolerante sigue siendo obligatorio —los archivos editados a mano son lo
normal, no el borde— pero no se puede verificar contra `inmobiliaria`: se verifica con el
fixture de D-11.

**Decidido:** el servidor devuelve el markdown crudo completo **y** un índice de entradas
parseado de forma tolerante — toda sección `## ` es una entrada; su id es el primer token, y
los campos que matcheen el formato se extraen, los que no, quedan vacíos. La web renderiza el
markdown y usa el índice para el buscador y el anclado por id.

**Descartado:** devolver solo entradas estructuradas. Lo que no parsea, desaparece, y un
documento que se consulta para citar ids no puede perder párrafos.

**Descartado:** buscar en el servidor. El archivo entra entero en una respuesta; filtrar en el
cliente es instantáneo y no agrega un endpoint.

### D-9 · El historial es una lista cerrada de eventos, abierta a lo desconocido

Los eventos que `registrar()` escribe hoy, leídos de `src/orquestador.ts`: `inicio`,
`detenida`, `rescate`, `preguntas`, `aparcada`, `solicitud_rechazada`, `solicitud`, `entrega`,
`agente_completo`, `completada`, `recordatorio_de_cierre`, `corte_de_red`,
`verificacion_fallida`.

Cada uno tiene su `detalle` con forma propia y la web los presenta distinto. Un evento con un
nombre que no está en esa lista —porque el orquestador sumó uno— se muestra genérico: fecha,
nombre y su detalle en crudo. Nunca se descarta ni rompe la vista.

**Seis de los trece tienen como `detalle` un string pelado, no un objeto** (leído de las llamadas
a `registrar()` en `src/orquestador.ts`): `detenida` el motivo, `rescate` el repo, `aparcada` el id
de la pregunta, `solicitud_rechazada` el id de la solicitud, `completada` el resumen de cierre y
`recordatorio_de_cierre` el id del agente. Los otros siete traen un objeto. Una vista que asuma
objeto para los trece no tiene campos que recorrer en esos seis: el detalle se muestra como el
texto que es. La forma exacta de cada uno la documenta el servidor en `servidor/docs/lectura/`
(`I-07`).

**El `detalle` de `verificacion_fallida` no trae la salida del comando** (encontrado al preparar
`I-15`). `registrar()` lo escribe como `{ agente, comando, reintentable, intento }`
(`src/orquestador.ts:327`). La salida del comando que falló existe —`verificar()` la devuelve en
`v.salida`, `src/verificacion.ts:26`— pero el orquestador la usa para armar el mensaje con el que
le devuelve el turno al agente (`src/orquestador.ts:357`) y **no la persiste en el estado**. La
interfaz no puede mostrarla porque no está en el archivo que lee. El criterio de `I-11` que la
pedía se corrigió, y el fixture de `I-15` copia la forma del código en vez de inventar el campo:
un fixture con un `salida` que el orquestador nunca escribe haría pasar una pantalla que con datos
reales queda vacía, que es el modo de falla que los fixtures vienen a evitar.

**Y el fixture de `aparcada` de `I-14` cayó justo en ese modo de falla** (encontrado al revisar
`I-15`): `scripts/fixtures.ts` le puso al evento `aparcada` un `detalle` de objeto
(`{ motivo, pregunta }`) cuando `src/orquestador.ts:148` escribe el id de la pregunta pelado. La
lista de los seis de arriba no cambia —era correcta—; lo que estaba mal era el fixture, y se
corrige en `I-15`. Vale como confirmación de que la lista de seis hay que leerla del código y no
de los datos de prueba: el único evento `aparcada` disponible en todo el repo venía de un fixture,
y venía con la forma equivocada.

### D-10 · El esquema del estado se lee como parcial

Los JSON en disco vienen de versiones distintas: los de septiembre no tienen
`reposParticipantes`. **Decidido:** el servidor tipa lo que lee como
`Partial<EstadoTarea>` y completa con valores neutros (`0`, `{}`, `[]`) antes de responder, así
la web recibe siempre la misma forma y no tiene condicionales por versión. Un archivo que ni
siquiera es JSON válido se reporta como una entrada en error dentro de la lista, sin tumbar
las otras 40.

La forma de `pendiente` se respeta tal como la escribe el orquestador, **anidada**:
`src/buzon.ts:77` la declara como `{ pregunta: Pregunta; trabajo: Trabajo }`, y los campos que
la pantalla necesita (`porQue`, `dondeBusque`, `opciones`, `recomendacion`) están adentro de
`pregunta` (`src/canal.ts:1`), no al tope. No se aplana: si la web los busca un nivel más arriba
no los encuentra.

### D-11 · Los casos que no están en disco se prueban con fixtures, nunca mutando datos reales

Varios requisitos cubren casos que **no existen** en el disco de este repo. Verificado archivo
por archivo sobre los 49 JSON que había en `.orquestador/` al escribir esta spec: ninguno está
`aparcada`, ninguno tiene `pendiente`, ninguno tiene el historial vacío y ninguno es JSON
inválido. Los estados que sí hay son `completada`, `detenida` y `en_curso`.

**Decidido:** esos casos se verifican con proyectos de fixture, carpetas
`.orquestador/fixture-<caso>/` con JSON escritos a mano para el caso. Se crean para la
verificación y se borran al terminar. Funciona sin agregarle nada al servidor porque el
inventario es la unión de config y estado (D-1): una carpeta en `.orquestador/` ya aparece como
proyecto sin config, que es justo el camino que se quiere ejercitar.

Dos consecuencias que hay que respetar:

- **Ningún criterio de aceptación se verifica editando, renombrando o corrompiendo un archivo
  real de `.orquestador/`.** `.orquestador` está en `.gitignore`: esos JSON no están versionados,
  y los 41 de `inmobiliaria` son historial de corridas que no se puede volver a generar. Un
  `git checkout` no los trae de vuelta porque git nunca los tuvo.
- Mientras exista una carpeta de fixture, el inventario trae más de seis proyectos. Los
  criterios que cuentan seis valen con el disco limpio, sin fixtures.

**El caso de `decisiones.md` va aparte.** Un fixture de decisiones no alcanza con una carpeta en
`.orquestador/`: para que la API sirva un `decisiones.md` hace falta un proyecto **con config**,
porque la raíz sale de ahí, y crear un `proyectos/*.ts` cae fuera de la carpeta del agente que
implementa. Así que se parte en dos: el parseo tolerante es una función pura sobre el texto del
markdown y se verifica contra un archivo de muestra en `servidor/fixtures/`, dentro de la carpeta
del agente; el cableado del endpoint se verifica con los casos que el disco **sí** da.

**Los casos de disco de `I-06`, corregidos al implementarlo.** La enumeración anterior daba
cuatro y daba uno mal: decía que `prueba` servía para el caso "config, raíz existente, sin
`decisiones.md`", y hoy `/tmp/prueba-orq/decisiones.md` existe (lo escribió una corrida real el
2026-10-01 08:49). Siguen siendo los mismos cuatro proyectos, pero `prueba` cambió de rol:

| Caso | Proyecto | Qué ejercita |
| --- | --- | --- |
| Config, raíz relativa al cwd, con `decisiones.md` | `interfaz` (`raiz: "."`) | El `decisiones.md` de la raíz del repo, y la trampa del cwd de D-3 |
| Config, raíz absoluta fuera del repo, con `decisiones.md` | `prueba` (`/tmp/prueba-orq`) | Que la raíz resuelta se respete y no se sirva el archivo del repo |
| Sin config | `inmobiliaria` | `200` "no hay raíz que resolver" |
| Config con raíz inexistente | `ejemplo-spec` | `200` que lo dice, sin excepción de filesystem |

El cambio de rol de `prueba` no es una pérdida: `interfaz` y `prueba` cubren ahora los dos modos
de resolución de raíz que el config admite —relativa al cwd y absoluta—, y ese par detecta un cwd
mal fijado comparando las dos respuestas, que es el modo de falla que D-3 llama el peor. El caso
vacío que `prueba` cubría antes se verifica igual, en `I-16`.

**La rama que quedó sin disco: "raíz existente y sin `decisiones.md`".** R-05 la sigue pidiendo y
el código la tiene (un `existsSync` antes de leer), pero ningún proyecto de este repo la produce.

**Decidido:** se parte igual que el parseo tolerante. La lectura de decisiones a partir de una
raíz **ya resuelta** queda invocable con una ruta, separada de la resolución nombre → raíz, y se
apunta a una carpeta de fixture sin `decisiones.md` dentro de `servidor/fixtures/`. Queda en la
carpeta del agente que lo implementa, no necesita config nueva y no depende de que a un proyecto
real le siga faltando un archivo. Es `I-16`.

**Descartado:** un proyecto de fixture con config, que es la primera opción que aparece. La raíz
sale del config, así que haría falta un `proyectos/<nombre>.ts`, y `proyectos/` no está en la
carpeta de ninguno de los tres agentes: nadie puede escribirlo sin que le amplíen el alcance. Eso
es una decisión, no una tarea.

**Descartado:** darla por verificada leyendo el código. Es correcta por lectura —se revisó—, pero
un criterio que no se puede ejercitar deja de distinguir el código que funciona del que compila,
y esta feature ya tiene cuatro criterios que viven de fixtures justamente para no caer en eso.

**Descartado:** borrar o mover `/tmp/prueba-orq/decisiones.md` para que el caso vuelva. Es un
archivo de decisiones escrito por una corrida real; D-11 no muta datos reales para verificar, y la
regla no cambia porque el archivo esté en `/tmp` y no en `.orquestador/`.

**Descartado:** darle al servidor una variable para apuntar `.orquestador/` a otra carpeta en
las pruebas. Es configuración nueva que después hay que mantener sincronizada, y el manual pide
no multiplicar configuración (igual que en D-7).

**Descartado:** tocar los archivos reales y revertirlos después. Es la opción que el texto
anterior de esta spec dejaba abierta, y es la que pierde datos: sin versionado, un revert mal
hecho no tiene vuelta.

---

## Contrato HTTP

Las cinco rutas son las de `MANUAL-WEB.md` §3. **El servidor es dueño del contrato**: acá está
qué datos tiene que haber en cada respuesta; la forma exacta, con ejemplos sacados de archivos
reales de `.orquestador/`, la documenta él en `servidor/docs/lectura/`.

| Ruta | Devuelve |
| --- | --- |
| `GET /api/proyectos` | Inventario (D-1). Por proyecto: nombre, si tiene config, si tiene estado, si la raíz existe, ids de agentes, cantidad de tareas, costo acumulado, fecha de la última tarea |
| `GET /api/proyectos/:nombre` | Config resuelta del proyecto y sus agentes (R-02), más las marcas de config/raíz faltante |
| `GET /api/proyectos/:nombre/tareas` | Lista de tareas, de la más reciente a la más vieja (R-03) |
| `GET /api/proyectos/:nombre/tareas/:id` | Estado completo de la tarea: cabecera, historial y pregunta pendiente (R-04) |
| `GET /api/proyectos/:nombre/decisiones` | Markdown crudo más índice de entradas (D-8) |

Reglas transversales:

- Solo `GET`. Cualquier otro método, `405`.
- Proyecto o tarea inexistentes: `404` con un mensaje que diga cuál no se encontró.
- "Sin config" y "sin decisiones" **no** son `404`: son respuestas `200` con el dato de que no
  hay (R-05). Un `404` ahí haría que la web los muestre como falla.
- `RegExp` (`sensibles`, `bashProhibido`) no sobrevive a `JSON.stringify`: se serializa como
  string antes de responder, o no se expone. **Rama tomada al implementar `I-03`: no se exponen.**
  R-02 no los pide, así que la alternativa queda cerrada y la web no tiene que esperarlos. Los dos
  únicos casos en disco son `sensibles` en `ejemplo-pedidos` y `bashProhibido` en
  `ejemplo-python-react`; si una fase posterior los quiere mostrar, serializarlos como string es
  un agregado, no una corrección.

## Pantallas

Una sola página con navegación: proyectos → tareas → detalle, y decisiones colgando del
proyecto. Las reglas de diseño son las de `prompts/interfaz/web.md` y `MANUAL-WEB.md` §6:
oscuro, denso, sin animaciones de entrada, lo que necesita a la persona primero.

- **Proyectos**: una fila por proyecto. Los avisos de "sin configuración" y "la raíz no
  existe" van en la fila, no escondidos en el detalle.
- **Tareas**: una fila por tarea, las `aparcada` y `detenida` distinguibles de un vistazo, con
  su motivo a la vista.
- **Detalle**: la cabecera arriba, y el historial ocupando el ancho. La pregunta pendiente, si
  la hay, va antes que todo lo demás, en modo lectura y sin ningún control para contestar.
- **Decisiones**: el markdown renderizado con un campo de búsqueda que filtra entradas.

`design-system.md` (`MANUAL-WEB.md` §6) queda fuera de esta feature: estas cuatro pantallas se
hacen con las reglas ya escritas en el prompt del agente `web`. Si al implementarlas hace falta
un sistema de diseño antes, es una decisión, no una tarea de más.

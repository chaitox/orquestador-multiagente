 # Controles positivos

Lo que se midió, con qué, y lo que todavía no.

Un control positivo es romper a propósito lo que un mecanismo dice verificar, y confirmar que se
pone en rojo. **Un gate que nunca se vio fallar no está verificado.** Varios de los bugs de abajo
aparecieron al hacer exactamente eso.

---

## 1 · `dondeBusque` rechaza rutas inventadas —  medido (2026-09-17)

`node --experimental-strip-types` sobre `src/validacion-preguntas.ts`, con un repo de prueba que
solo contiene `src/pedidos/service.ts`, `docs/pedidos/README.md` y `decisiones.md`:

```
RECHAZA  rutas inventadas → src/pedidos/pedido.service.ts, docs/pedidos/contrato.md
RECHAZA  carpetas plausibles pero inexistentes → src/facturacion, docs/facturacion
RECHAZA  una real y una inventada → src/inventado.ts
ACEPTA   dos reales
ACEPTA   real con número de línea (src/pedidos/service.ts:120)
RECHAZA  escape fuera del repo → ../../etc/passwd
```

Cada entrada tiene que existir dentro de la raíz del agente, de sus `lecturaExtra` o de la raíz del
proyecto. Lo que NO prueba: que el agente haya **leído** el archivo, solo que existe.

Match en `decisiones.md`, mismo control:

```
MATCH DEC-abc-1 (1.00) → "Después del IVA, sobre el subtotal ya gravado."
SIN MATCH → va a Telegram: "¿cómo se numeran los comprobantes de nota de crédito?"
```

### Corrección posterior: el validador era demasiado literal

En uso real, el agente escribió `api/package.json (no tiene prisma)` — un comentario útil — y la
entrada se rechazaba porque el paréntesis contaba como parte de la ruta. Cinco rechazos seguidos, y
el agente reintentando variaciones al azar porque el mensaje no traía un ejemplo del formato
esperado.

Después del arreglo (toma el primer token, limpia comillas, paréntesis, comas y referencias de
línea):

```
ACEPTA  ["api/package.json", "api/src/app.module.ts"]
ACEPTA  ["api/package.json (no tiene prisma)", "api/src/app.module.ts # vacío"]
ACEPTA  ["`api/package.json`", "'api/src/app.module.ts:12'"]
RECHAZA ["api/inventado.ts", "api/package.json"]  → api/inventado.ts
```

Sigue rechazando lo inventado, que es lo que importa. **Lección:** un rechazo sin ejemplo del
formato correcto hace que el modelo reintente al azar. El mensaje de error es parte del mecanismo.

---

## 2 · Dos corridas con el mismo recurso —  medido, y encontró un bug

Dos procesos declarando `postgres-local`, el primero reteniéndolo 4 segundos.

**Primera corrida (código original):**
```
A: ADQUIRIDO a los 9ms
B: FALLA a los 0ms — El recurso "postgres-local" está tomado por ctrl/A (pid 111)
```
El lock **sí** era un archivo entre procesos (`~/.orquestador-locks/`), no memoria: B lo vio. Pero
fallaba en vez de esperar, contra lo que decía el manual ("ningún otro arranca"). No arrancaba,
pero porque explotaba, que no es lo mismo.

**Después del arreglo (poll cada 2 s hasta `recursosEsperaMin`):**
```
A: ADQUIRIDO a los 0ms
   ⏳ esperando "postgres-local", tomado por ctrl/A (pid 133)
A: liberado
B: ADQUIRIDO a los 4007ms
```

---

## 3 · Aparcar, matar el proceso, reanudar — ⏳ PENDIENTE

Requiere el SDK instalado; no se corrió. Procedimiento:

1. Tarea real, con `preguntas.timeoutMin: 1`.
2. Dejar que el agente pregunte en medio del trabajo (no en fase 0) y no responder.
3. Verificar que el JSON queda en `aparcada` con `pendiente`, `cola` y `sesiones`.
4. Matar el proceso. `npm run reanudar -- -p <p> -t <tarea> -r "<respuesta>"`.
5. **Lo que hay que mirar:** si el agente aplica la respuesta y sigue, o si vuelve a leer los mismos
   archivos y rehace el análisis.

Como la reanudación es un turno nuevo, el mensaje de reanudación reinyecta la pregunta, el `porQue`,
el `dondeBusque` y la recomendación, más la instrucción de no rehacer el análisis. Si aun así
reempieza, el problema no es el campo sino que el `resume` no está trayendo la sesión: comparar el
`session_id` del JSON con el de la corrida reanudada antes de culpar al prompt.

---

## 4 · Ids de tarea de la spec —  medido (2026-09-17)

`validarIdsTarea` contra un `tareas.md` con T-01, T-02 y T-03:

```
ACEPTA   ["T-01","T-03"]
RECHAZA  ["T-01","T-99"] → inexistentes: T-99
RECHAZA  ["T-07"]        → inexistentes: T-07
RECHAZA  []              (entrega sin citar ninguna tarea)
```

Lo que NO prueba: que la tarea citada sea la que se implementó. Eso sigue siendo lectura humana del
reporte.

---

## 5 · Ids de decisión únicos por feature —  medido, después de un bug

El generador original hacía `tareaId.slice(0, 12)`, y ese recorte caía **dentro del nombre de la
feature**: todas las corridas de `publicaciones` producían la misma serie de ids, así que las
decisiones de una corrida abortada colisionaban con las de la buena.

Lo detectó el propio agente de spec, que en vez de romperse citó las dos entradas duplicadas
distinguiéndolas por tema. El arreglo lee el máximo existente en `decisiones.md`:

```
publicaciones → DEC-publicaciones-03
panel         → DEC-panel-02
reportes      → DEC-reportes-01   (feature nueva)
```

El id se asigna **dentro de la cola de preguntas**, no al construirlas, para que dos preguntas del
mismo turno no reciban el mismo número.

---

## 6 · El canal de consola —  medido, tres veces, dos arreglos fallidos

El síntoma: respuestas de 900 caracteres registradas con 112, con el texto cortado a mitad de
palabra. El control fue comparar lo pegado contra lo guardado en `decisiones.md` **y** en el JSON
del orquestador, que se escriben por caminos distintos.

**Medición 1 — descarta la escritura.** El JSON y `decisiones.md` tenían exactamente el mismo texto
truncado, así que el problema estaba en la lectura, no al guardar.

**Medición 2 — descarta la hipótesis del principio perdido.** Los fragmentos guardados eran del
tipo `'Entra TERRENO como cuarto tipo...\nrreno: ...'`: la primera línea completa y después un salto
a mitad de palabra. No se perdía el principio: se perdía **el medio**.

**Medición 3 — la causa.** Una respuesta guardada contenía `'⏸ spec pregunta — esperando
respuesta...'`, que es **salida del propio orquestador metida dentro de la respuesta del usuario**.
Eso identificó la causa real: `readline` administra el terminal y, con un pegado grande mientras el
proceso imprime, la entrada y la salida se mezclan.

**Arreglo 1 (fallido):** una sola interfaz de `readline` con el listener siempre conectado. Atacaba
un problema real —los huecos entre `await`— pero no este.

**Arreglo 2 (el que funcionó):** leer `process.stdin` directo, sin `readline`. El terminal sigue en
modo canónico y el orquestador solo consume el stream.

**Lección de método:** el registro paralelo en JSON, que parecía redundante, fue lo que permitió
descartar la escritura como causa en un minuto, dos veces.

---

## 7 · El canal de Telegram —  medido, dos bugs

**Bug 1: mensajes viejos tomados como respuesta.** Al reescribir el canal para aceptar cualquier
texto del chat, se perdió el paso que descartaba la cola pendiente antes de preguntar. Resultado: la
respuesta de una corrida anterior, que llegó tarde, se registró como respuesta de la pregunta
siguiente. El agente detectó que el texto no respondía su pregunta y volvió a preguntar, acotando.

Arreglo: `vaciarPendientes()` antes de cada `preguntar` y cada `confirmar`.

**Bug 2: `TELEGRAM_TOPICS` en un chat privado.** Un `message_thread_id` inexistente hace que Telegram
rechace el envío. La pregunta no llegaba a ningún lado.

**Y el hallazgo más importante, que salió de ese bug:** con el canal caído, el agente **siguió con
un supuesto** y anotó el tema como riesgo, en vez de detenerse. El handler dejaba salir la excepción
y el modelo se recuperaba decidiendo por su cuenta.

Arreglo: el handler captura el error y devuelve una instrucción explícita — *"la pregunta NO llegó;
no sigas con un supuesto, no lo anotes como riesgo para continuar: registrá el bloqueo con
no_se_puede"*. Un error de configuración no debería poder cambiar quién decide.

**Lección:** `preguntar` estaba probado con respuesta y con timeout, nunca con el canal caído. El
camino de error de un mecanismo de seguridad necesita su propio control positivo.

---

## 8 · El init versionaba `node_modules` —  encontrado en uso

`inicializarGit` hacía `git init && git add -A && git commit` inmediatamente después del generador,
cuando el `.gitignore` todavía no existía. Resultado: un repo con 200 MB de dependencias versionadas
y un `git status` inutilizable.

Arreglo: `asegurarGitignore()` escribe el archivo **antes** del commit inicial, y completa el que ya
exista con las entradas que falten.

---

## 9 · El contrato no veía el trabajo rescatado — medido (2026-09-29), arreglo parcial

**El bug:** `validarContrato` (`src/herramientas.ts`) miraba solo `git status`, es decir, lo que
estaba sin commitear. No había ningún "commit base" registrado al arrancar la tarea. Cuando una
corrida se detiene, `detener()` commitea lo hecho con `SIN-VERIFICAR`, y la corrida siguiente, al
cerrar, veía cero cambios y rechazaba.

**Arreglo:** `baseVerificada(repo)` en `src/git.ts` recorre el log desde HEAD y devuelve el primer
commit cuyo asunto no lleva la marca. El contrato cuenta ahora lo sin commitear **más** lo que
cambió entre esa base y HEAD. Si la base es HEAD, que es el caso sin rescates, el comportamiento es
el de antes. La base se calcula al cerrar, dentro de `validarContrato`, y no al arrancar la tarea.
Así una entrega commiteada durante la misma corrida no le cuenta al cierre siguiente, igual que
antes.

Repo temporal: `normal: base` y dos commits `SIN-VERIFICAR` encima (`docs/contrato.md`, `b.txt`).
Agente con contrato `requiereCambiosEn: ["docs/**"]`:

```
baseVerificada          = 9aed94b… OK (es el commit normal)
antes: git status ve    = []
ahora: rescatados       = ["b.txt","docs/contrato.md"]
sin marcas: base es HEAD = true
repo vacío: null

tarea_completa, código anterior, HEAD en el 2º SIN-VERIFICAR → Rechazado: no hay cambios en docs/**
tarea_completa, código nuevo,    HEAD en el 2º SIN-VERIFICAR → Tarea marcada como completa
tarea_completa, código nuevo,    HEAD en el commit normal    → Rechazado: no hay cambios en docs/**
```

**Sin medir / abierto:**
- **Rama atrasada respecto de main: el bug sigue.** Si la rama del agente quedó atrás, `asegurarRama`
  mergea main encima de los commits `SIN-VERIFICAR`. El merge (`actualiza feat/x con main`) no lleva
  la marca, así que `baseVerificada` devuelve el merge = HEAD y los rescatados vuelven a ser
  invisibles. Medido en el mismo repo temporal: `base es HEAD (el merge): true → rescatados: []`.
  Saltear el merge y comparar contra el commit normal tampoco sirve, porque metería los cambios de
  main en la cuenta y el contrato podría pasar con trabajo ajeno.
- No se probó en una corrida real con el SDK: la prueba es de las funciones y del handler.

---

## 10 · Instrumentación de las herramientas de coordinación — medido el log, no la causa

**El síntoma:** en tres corridas, llamadas a `mcp__coordinacion__*` (`tarea_completa`,
`entrega_lista`) se cortaron sin devolver resultado, mientras Bash y ToolSearch seguían andando.

**Lo que se agregó (solo instrumentación, no arreglo):** en `src/motores/claude.ts` cada handler
pasado a `tool()` queda envuelto y escribe en `.orquestador/herramientas.log`, con
`appendFileSync` para que la línea quede escrita aunque el proceso muera:

```
… ctrl tarea_completa ENTRADA {"resumen":"…"}
… ctrl tarea_completa SALIDA {"ms":32,"salida":{"content":[…],"isError":false}}
… ctrl entrega_lista ENTRADA {"resumen":"…"}
… ctrl entrega_lista EXCEPCION {"ms":20,"mensaje":"falla provocada","stack":"Error: falla provocada\n    at …"}
```

Medido invocando los handlers registrados en el servidor MCP que arma `opcionesDe`. La excepción se
provocó rompiendo el buzón a propósito, y se confirmó que se sigue propagando igual que antes.

**Cómo leerlo:** una `ENTRADA` sin `SALIDA` ni `EXCEPCION` es una llamada que nunca terminó. Si
tampoco hay `ENTRADA`, la llamada nunca llegó al handler: el corte está en el SDK o en el transporte
MCP, antes de este código.

**Sin medir:** que el log capture el síntoma real. Eso recién se ve en la próxima corrida que se
corte. Tampoco se registra si el SDK aborta la llamada (el `extra` del handler, con su `signal`, no
se inspecciona).

---

## 11 · Cortes de red: reintentar en vez de detener — medido el clasificador, no el reintento

**Antes:** un error de red detenía la tarea igual que un error del agente.

**Ahora:** en `correrConVerificacion` (`src/orquestador.ts`), si `ejecutarAgente` vuelve con un
error de red y el agente todavía no cerró nada (sin entrega, completa, bloqueo, solicitudes ni
pregunta sin responder), se
espera 10, 30 y 60 s y se retoma la misma sesión. El mensaje se reenvía con un aviso de corte al
frente, porque no se sabe si llegó a la sesión antes del corte. Tras el tercer fallo sigue el camino
de siempre y la tarea se detiene. Cada reintento queda en el historial como `corte_de_red`.

**Qué se considera de red** (`esErrorDeRed` en `src/motores/claude.ts`), buscado en el texto del
error:

```
/\bENOTFOUND\b/            /\bECONNRESET\b/          /\bECONNREFUSED\b/
/\bETIMEDOUT\b/            /\bEAI_AGAIN\b/           /\bENETUNREACH\b/
/can.t reach the api server/i
/\bConnection error\./     ← texto por defecto de APIConnectionError en el SDK
/\bRequest timed out\./    ← texto por defecto de APIConnectionTimeoutError en el SDK
```

**Cambio necesario fuera del reintento:** antes, un `result` con error guardaba solo el subtipo
(`error_during_execution`), y con eso no se puede distinguir un corte de red de otra falla. Ahora el
error lleva además `errors[]` del result y el texto de los mensajes de API con `error`:
`error_during_execution — <detalle>`. El motivo de `detener` muestra ese detalle.

Clasificador, medido:

```
RED     "getaddrinfo ENOTFOUND api.anthropic.com"
RED     "read ECONNRESET"
RED     "error_during_execution — API Error: Can't reach the API server"
RED     "error_during_execution — Can’t reach the API server"
RED     "connect ECONNREFUSED 127.0.0.1:443"
RED     "error_during_execution — Connection error."
RED     "Request timed out."
NO RED  "error_during_execution"
NO RED  "error_max_turns"
NO RED  "falló la verificación \"npm test\" tras 3 intentos"
NO RED  "Claude Code process exited with code 1"
NO RED  "API Error: 529 overloaded"
NO RED  "enotfound en minúscula dentro de un texto"
```

**Sin medir:**
- El bucle de reintento en sí (esperas, retomar la sesión, detener al cuarto fallo). No se simuló un
  corte contra el SDK.
- Dónde aparece exactamente "Can't reach the API server" en una corrida real: en `errors[]` del
  result, en un assistant con `error` o en una excepción. Los tres caminos quedan cubiertos, pero no
  se vio cuál es.
- Si el CLI informara el corte como `result` `success` con `is_error: true`, no se detecta. Ese caso
  sigue como antes: recordatorio de cierre.
- Que retomar la sesión tras un corte no duplique trabajo. El aviso le pide al agente que no rehaga
  lo hecho, pero no hay control de eso.

---

## Pendientes conocidos

- **El glob exige al menos una carpeta donde va un `**` que no está al final.** `**/*.md` no
  matchea `requisitos.md` en la raíz del agente (sí `lectura/requisitos.md`), y `docs/**/x.md` no
  matchea `docs/x.md`. El `**` final sí está bien resuelto (`docs/{feature}/**` matchea
  `docs/{feature}` y todo lo de adentro). Hoy es teórico: ningún proyecto de `proyectos/` usa `**`
  al principio ni en el medio de un patrón (2026-10-01). Hay que arreglarlo antes de que alguno lo
  haga, porque el rechazo es silencioso: el contrato dice "no hay cambios" con el archivo escrito.
- **`dondeBusque` no prueba lectura, solo existencia.** Si el SDK expone el historial de la sesión,
  cruzar las entradas contra las llamadas a `Read`/`Grep` de ese agente cierra el hueco.
- **El match de `decisiones.md` es por palabras.** Atrapa las repetidas literales; no atrapa la misma
  pregunta con otro vocabulario.
- **El traspaso entre agentes (`solicitar_a`) no se ejercitó.** En el proyecto real las tareas
  quedaron tan separadas que nunca hizo falta: todas las corridas cerraron con "Solicitudes entre
  agentes: 0". Es la pieza central del orquestador y sigue sin control positivo. Para probarlo hay
  que crear la situación: pedirle al front algo que el backend no expone.
- **No hay planificador de tareas.** Una tarea aparcada no libera el turno para otra: el orquestador
  corre una por invocación.
- **Los gates de un proyecto no se corren solos.** En un caso real, seis scripts de verificación no
  habían corrido en toda una tanda de trabajo porque faltaba un intérprete en la máquina, y no había
  CI. Un gate que nadie ejecuta es un gate que no existe.
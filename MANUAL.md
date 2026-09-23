# Manual — Orquestador multi-agente

Coordina N agentes del Claude Agent SDK (uno por parte de un sistema) que se piden trabajo entre sí.
Para usarlo en un proyecto nuevo solo se crea un archivo en `proyectos/` y uno o más prompts en `prompts/`.
El código de `src/` no se toca.

---

## 1. Cómo funciona

```
agente A ──solicitar_a("B")──▶ ORQUESTADOR ──(aprobación si es sensible)──▶ agente B
   ▲                                                                            │
   └──── resume de su sesión + resumen ◀── commit ◀── verificación ◀── entrega_lista
```

1. Arranca el **agente principal** con tu tarea.
2. Si necesita algo de otro agente, llama a `solicitar_a` y termina su turno.
3. El orquestador encola la solicitud y ejecuta al agente destino.
4. El destino cierra con `entrega_lista`, que se **rechaza** si no cumple el contrato del proyecto.
5. Se corren las **verificaciones** del agente. Si fallan, se le devuelve el error para que corrija.
6. Se hace commit en su repo y se **retoma la sesión** del agente que pidió.
7. Termina cuando el agente inicial usa `tarea_completa` y no queda nada en la cola.

Las sesiones se retoman con `resume`, así que cada agente conserva su contexto entre idas y vueltas.

---

## 2. Instalación

```bash
npm install
cp .env.example .env     # opcional
npm run typecheck
```

Requisitos: Node 20.12+, git, y Claude Code instalado y logueado (o `ANTHROPIC_API_KEY` en `.env`).

---

## 3. Uso

```bash
npm run listar                                           # proyectos configurados
npm run tarea -- -p pedidos -f pedidos "Integrar la pantalla de pedidos"
npm run tarea -- -p pedidos -f pedidos -a api "Agregar filtro por estado"   # arrancar por otro agente
```

| Flag | Qué hace |
|---|---|
| `-p, --proyecto` | Archivo de `proyectos/<nombre>.ts` |
| `-f, --feature` | Nombre de la feature: se usa en la rama y en `{feature}` de los contratos |
| `-a, --agente` | Agente que arranca (por defecto, `agentePrincipal`) |
| `-l, --listar` | Lista los proyectos |

Salida: log por agente con color, y el detalle de la tarea en `.orquestador/<proyecto>/<tarea>.json`
(sesiones, historial, costo estimado, ramas).

---

## 4. Crear el proyecto desde cero (`npm run init`)

Si en el config un agente tiene `plantilla`, el orquestador crea la carpeta con el generador
oficial del stack cuando todavía no existe:

```bash
npm run init -- -p pedidos              # crea lo que falte de todos los agentes
npm run init -- -p pedidos -a portal    # solo un agente
npm run init -- -p pedidos --simular    # muestra los comandos sin ejecutarlos
npm run init -- -p pedidos --actualizar # antes de crear: flutter upgrade / uv self update
```

Lo que hace por cada agente que falta:

1. Verifica que estén los binarios necesarios y muestra la versión local.
2. Corre el generador y los comandos de `postInstalacion`.
3. Inicializa el repo git si no existe.
4. Crea las carpetas fijas del contrato (ej: `docs/` a partir de `docs/{feature}/**`).
5. Escribe un `CLAUDE.md` inicial con las reglas del agente.
6. Sugiere los comandos de `verificacion` si no los pusiste.

Los agentes que ya existen se saltean: es seguro volver a correrlo.

### Plantillas disponibles

| `tipo` | Genera con | Requiere | Verificación sugerida |
|---|---|---|---|
| `flutter` | `flutter create` | flutter | `flutter analyze`, `flutter test` |
| `nestjs` | `npx @nestjs/cli@latest new` | npx | `npm run build`, `npm test` |
| `nextjs` | `npx create-next-app@latest` (TS, App Router, Tailwind) | npx | `npm run lint`, `npm run build` |
| `react-vite` | `npm create vite@latest` (react-ts) | npm | `npm run build` |
| `node-ts` | `npm init` + TypeScript + tsx | npm | `npx tsc --noEmit` |
| `fastapi` | `uv init` + fastapi, uvicorn, sqlalchemy, alembic | uv | `uv run ruff check .`, `uv run pytest -q` |
| `django` | `uv init` + django + `startproject` | uv | `uv run python manage.py check` |
| `python-lib` | `uv init --lib` | uv | `uv run ruff check .`, `uv run pytest -q` |
| `custom` | los comandos que le pongas | — | — |

### Opciones de la plantilla

```ts
plantilla: {
  tipo: "nestjs",
  opciones: ["--strict"],                      // flags extra para el generador
  postInstalacion: ["npm i -D prisma@latest",  // libs propias del proyecto
                    "npx -y prisma init"],
  generarClaudeMd: true,                       // por defecto true
}

// Cualquier stack no contemplado:
plantilla: {
  tipo: "custom",
  comandos: ["git clone git@github.com:mi-org/plantilla-base.git {nombre}"],
  postInstalacion: ["npm install"],
}
```

### Sobre "la última versión"

Los generadores de Node van pineados a `@latest`, así que siempre bajan el más nuevo al momento
de correr el init. En cambio **Flutter, Node y Python salen de tu máquina**: el init te muestra la
versión local y, con `--actualizar`, corre `flutter upgrade` o `uv self update` antes de crear.
Node conviene manejarlo con nvm o fnm por fuera.

## 5. Dónde corre cada agente

Cada agente se ejecuta **dentro de su propia carpeta** (`cwd = raiz`), igual que si abrieras una
terminal ahí y corrieras `claude`. El orquestador es solo el proceso que coordina; no aporta contexto.

Eso significa que, por cada agente, se carga:

- el `CLAUDE.md` de su repo (y los de las carpetas superiores, útil en monorepo),
- sus `.claude/rules/`, `.claude/skills/`, `.claude/agents/` y `.claude/settings.json`,
- sus comandos de `verificacion`, que también corren ahí.

Esto depende de `ajustes` (equivale a `settingSources` del SDK). El SDK, a diferencia del CLI,
**no carga nada del disco por defecto**: si lo dejás en `[]`, tus reglas y skills se ignoran.

```ts
{ id: "api", ajustes: ["project"] }            // por defecto: solo el .claude/ del repo
{ id: "api", ajustes: ["project", "user"] }    // suma tu ~/.claude personal
{ id: "api", ajustes: [] }                     // agente limpio, sin config del repo
```

El estado del orquestador (`.orquestador/`) queda en la carpeta del orquestador, no dentro de tus repos.

---

## 6. Agregar un proyecto (3 pasos)

**1. Crear `proyectos/mi-proyecto.ts`:**

```ts
import { defineProyecto } from "../src/tipos.js";

export default defineProyecto({
  nombre: "mi-proyecto",
  raiz: "~/dev/mi-proyecto",
  agentePrincipal: "web",
  agentes: [
    {
      id: "web",
      descripcion: "Front en Next.js",
      raiz: "web",
      prompt: "mi-proyecto/web.md",
      verificacion: ["npm run build"],
    },
    {
      id: "api",
      descripcion: "API en NestJS",
      raiz: "api",
      modelo: "opus",
      prompt: "mi-proyecto/api.md",
      verificacion: ["npm run build", "npm test"],
      contrato: { requiereCambiosEn: ["docs/{feature}/**"] },
    },
  ],
});
```

**2. Crear los prompts** en `prompts/mi-proyecto/web.md` y `api.md` (copiá `prompts/plantillas/generico.md`).

**3. Probar** con una feature chica:

```bash
npm run tarea -- -p mi-proyecto -f perfil "Agregar edición de perfil"
```

---

## 7. Referencia del config

### Proyecto

| Campo | Tipo | Por defecto | Para qué |
|---|---|---|---|
| `nombre` | string | — | Identifica el proyecto y la carpeta de estado |
| `raiz` | string | cwd | Base de las rutas relativas. Acepta `~` y `${VAR}` |
| `agentePrincipal` | string | — | Quién arranca y quién cierra la tarea |
| `agentes` | Agente[] | — | Uno por cada parte del sistema. **La cantidad es libre** |
| `modeloPorDefecto` | string | `sonnet` | Modelo de los agentes que no declaran uno |
| `maxSolicitudes` | number | 6 | Tope de pedidos entre agentes por tarea (corta loops) |
| `maxTurnos` | number | 60 | Tope de turnos internos por ejecución |
| `maxIntentosVerificacion` | number | 2 | Reintentos cuando falla un comando de verificación |
| `sensibles` | RegExp[] | `[]` | Si la solicitud matchea, te pide aprobación por consola |
| `reglasEscalada` | string[] | ver §11 | Reglas inyectadas en el prompt de todos los agentes |
| `preguntas.canal` | `"consola"\|"telegram"\|"ambos"` | `consola` | Por dónde se pregunta y se aprueba |
| `preguntas.timeoutMin` | number | 30 | Espera máxima por una respuesta |
| `preguntas.maxPorTarea` | number | 10 | Tope de preguntas por tarea |
| `preguntas.avisarFin` | boolean | `true` | Avisar por el canal cuando la tarea termina |
| `preguntas.fase0` | boolean | `true` | Preguntar todo junto antes de escribir código |
| `recursosEsperaMin` | number | 60 | Minutos que una corrida espera un recurso tomado por otra |
| `spec.dir` | string | — | Carpeta de la spec (admite `{feature}`). Activa la validación de ids |
| `spec.archivoTareas` | string | `tareas.md` | Archivo contra el que se validan los ids citados |
| `git.estrategia` | `"rama-por-tarea" \| "ninguna"` | `rama-por-tarea` | Crea `<prefijo><feature>` en cada repo |
| `git.prefijoRama` | string | `agente/` | Prefijo de la rama |
| `git.commitAlCerrar` | boolean | `true` | Commit automático al cerrar entrega o tarea |
| `git.exigirLimpio` | boolean | `true` | Exige árbol limpio antes de arrancar |

### Agente

| Campo | Tipo | Por defecto | Para qué |
|---|---|---|---|
| `id` | string | — | Cómo lo nombran los otros agentes en `solicitar_a` |
| `descripcion` | string | — | Se le muestra a los demás para que sepan a quién pedirle qué |
| `raiz` | string | — | Carpeta donde trabaja. **Es su límite de escritura** |
| `repo` | string | su raíz | Repo git. En monorepo, todos apuntan al mismo |
| `modelo` | string | `modeloPorDefecto` | `opus`, `sonnet`, `haiku` o el id completo |
| `prompt` | string | — | Archivo dentro de `prompts/` |
| `lecturaExtra` | string[] | `[]` | Carpetas que puede leer sin escribir (contratos ajenos) |
| `verificacion` | string[] | `[]` | Comandos que corre el orquestador tras cerrar |
| `contrato.requiereCambiosEn` | string[] | `[]` | Globs que deben tener cambios para poder cerrar |
| `contrato.mensajeRechazo` | string | genérico | Lo que ve el agente si no cumple |
| `plantilla.tipo` | ver tabla | — | Con qué generar la carpeta en `npm run init` |
| `plantilla.opciones` | string[] | `[]` | Flags extra para el generador |
| `plantilla.postInstalacion` | string[] | `[]` | Comandos dentro del proyecto recién creado |
| `plantilla.generarClaudeMd` | boolean | `true` | Crear un CLAUDE.md inicial |
| `bashProhibido` | RegExp[] | `[]` | Comandos extra bloqueados para ese agente |
| `recursos` | string[] | `[]` | Recursos externos que toma en exclusiva (base, Redis, puerto) |
| `verificacion[].reintentar` | boolean | `true` | `false` = si falla, se detiene en vez de reintentar |
| `contrato.cuando` | `"siempre"\|"si-cambia"` | `siempre` | Exigir el contrato solo si se tocaron los `disparadores` |
| `contrato.disparadores` | string[] | `[]` | Globs que activan el contrato condicional |
| `ajustes` | `("user"\|"project"\|"local")[]` | `["project"]` | Qué carga del disco: `.claude/` del repo, `.claude/settings.local.json`, `~/.claude` |

Los globs soportan `**`, `*` y `{feature}`: `docs/{feature}/**`, `openapi.json`, `src/types/*.ts`.

---

## 8. Recetas por stack

Copiá el bloque del agente que corresponda.

**Flutter / Flutter Web**
```ts
{ id: "app", descripcion: "App Flutter", raiz: "app", prompt: "x/app.md",
  verificacion: ["flutter analyze", "flutter test"] }
```

**NestJS / Node**
```ts
{ id: "api", descripcion: "API NestJS", raiz: "api", modelo: "opus", prompt: "x/api.md",
  verificacion: ["npm run build", "npm test -- --passWithNoTests"],
  contrato: { requiereCambiosEn: ["docs/{feature}/**"] } }
```

**Next.js / React**
```ts
{ id: "web", descripcion: "Front Next.js", raiz: "web", prompt: "x/web.md",
  verificacion: ["npm run lint", "npm run build"] }
```

**Python (FastAPI / Django)**
```ts
{ id: "api", descripcion: "API FastAPI", raiz: "apps/api", prompt: "x/api.md",
  verificacion: ["ruff check .", "pytest -q"],
  contrato: { requiereCambiosEn: ["openapi.json"] },
  bashProhibido: [/alembic\s+downgrade/] }
// Django: verificacion: ["python manage.py check", "pytest -q"]
```

**PL/SQL u otro sin build**
```ts
{ id: "db", descripcion: "Paquetes PL/SQL", raiz: "db", prompt: "x/db.md",
  verificacion: [],                                   // no hay compilador local
  contrato: { requiereCambiosEn: ["changelog/{feature}/**"] } }
```

### Monorepo vs repos separados

- **Repos separados**: cada agente con su `raiz`; `repo` se deduce solo. Rama y commit por repo.
- **Monorepo**: `raiz` apunta a la subcarpeta (`apps/web`) y `repo` al raíz del monorepo, igual para todos.
  Cada agente sigue limitado a su carpeta, pero la rama y los commits son compartidos.

---

## 9. Controles de seguridad

| Control | Dónde se configura |
|---|---|
| Escritura limitada a la carpeta del agente | automático (`raiz`) |
| Comandos peligrosos bloqueados (push, `rm -rf`, SQL destructivo, scripts remotos) | `src/permisos.ts` + `bashProhibido` |
| Aprobación humana para temas sensibles | `sensibles` |
| Cierre rechazado si no se cumple el contrato | `contrato.requiereCambiosEn` |
| Build/tests antes de dar por terminado | `verificacion` |
| Tope de idas y vueltas | `maxSolicitudes` |
| Bloqueo del agente detiene todo | herramienta `no_se_puede` |
| Todo el trabajo en una rama aparte | `git.estrategia` |
| Exclusión sobre base, Redis o puertos compartidos | `recursos` |
| Gates cuyo verde no se consigue a fuerza de reintentos | `verificacion[].reintentar: false` |
| Decisiones que no las toma un agente | `reglasEscalada` + `no_se_puede` |
| Que no invente nombres, reglas ni alcance | herramienta `preguntar` (lista chequeable + `dondeBusque`) |
| Que las respuestas no se pierdan | `decisiones.md` con id, citado en el reporte |
| Que sin respuesta no siga adivinando | estado `aparcada` + `npm run reanudar` |

Los agentes **no** pueden hacer commit ni cambiar de rama: eso lo hace el orquestador.

---

## 10. Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `tiene cambios sin commitear` | Limpiá el repo o poné `git.exigirLimpio: false` |
| `Falta el prompt del agente "x"` | El `prompt` del config no existe en `prompts/` |
| `La raíz del agente "x" no existe` | Corré `npm run init -- -p <proyecto>` o creá la carpeta a mano |
| `Para crear "x" hace falta "uv"` | Instalá el binario del stack (uv, flutter) o cambiá la plantilla |
| Se detiene con "terminó sin cerrar nada" | El agente no usó ninguna herramienta de cierre. Reforzá la definición de terminado en su prompt |
| Rechaza el cierre una y otra vez | El glob de `requiereCambiosEn` no matchea las rutas reales. Probá con `git status --porcelain` |
| La verificación falla siempre | El comando no corre en la `raiz` del agente, o necesita `npm install` previo |
| El agente ignora mis rules o skills | `ajustes` quedó en `[]`, o el `.claude/` no está en la `raiz` del agente sino más arriba |
| `El recurso "x" está tomado por ...` | Hay otra corrida usándolo. Esperá, o borrá el .lock si sabés que ese proceso ya no existe |
| Un agente hace el trabajo de otro | Falta claridad en `descripcion`, o su prompt no prohíbe los workarounds |
| Gasta demasiado | Bajá `maxSolicitudes`, usá `haiku`/`sonnet` en los agentes mecánicos y features más chicas |

---

## 11. Lo que el orquestador NO reemplaza

Automatiza el traspaso entre agentes y la exigencia de los gates. **No automatiza la crítica.**
Un lazo de verificación no detecta un test que verifica un camino inexistente, un mock sin stub,
ni una decisión registrada como cerrada que nunca se implementó. Eso lo detecta alguien leyendo
el reporte con la pregunta "¿esto prueba lo que dice que prueba?".

Tres mecanismos del config existen justamente para dejar lugar a esa lectura:

### `verificacion` con `reintentar: false`

Un lazo que reintenta hasta el verde optimiza para el verde. Sirve para `build`, `lint` o
`tsc --noEmit`, donde el rojo es mecánico. No sirve para gates cuyo verde solo vale si alguien
vio el rojo correspondiente: ahí el reintento automático abarata un camino que era caro a propósito.

```ts
verificacion: [
  "npm run build",                                        // reintentable
  { comando: "./scripts/verificar-mutaciones.sh",
    reintentar: false,                                    // si falla, se detiene la tarea
    descripcion: "revisar el rojo antes de tocar nada" },
]
```

### `reglasEscalada`

`sensibles` dispara por regexp sobre el texto de la solicitud, así que sirve para temas con
vocabulario predecible (certificado, timbrado, producción). Una pregunta de diseño no tiene
palabras predecibles: esa regla la tiene que llevar el agente adentro. `reglasEscalada` se
inyecta en el prompt de todos.

```ts
reglasEscalada: [
  "solicitar_a es para trabajo, no para decisiones.",
  "Si la respuesta requiere una decisión que no está escrita en los docs, usá no_se_puede.",
]
```

Sin esto, `solicitar_a` disuelve las paradas: un agente pregunta, el otro contesta con lo que le
parece, y una decisión de negocio queda tomada por dos programas.

### `contrato.cuando: "si-cambia"`

`requiereCambiosEn` solo funciona donde el cambio es obligatorio **siempre**. Si a veces no
corresponde, el agente aprende a fabricar el cambio para poder cerrar, y se pierden las dos cosas:
el chequeo y el dato. Es la misma familia que el test que no puede fallar.

```ts
contrato: {
  cuando: "si-cambia",
  disparadores: ["lib/**/*_api.dart", "lib/**/models/**"],  // solo si tocó esto
  requiereCambiosEn: ["docs/**", "DEUDA.md"],
}
```

---

## 12. Recursos externos compartidos

El límite de escritura de un agente es su carpeta, pero eso no cubre lo que comparten por fuera
del filesystem: una base, un Redis, un puerto, un entorno de demo. Un `db:demo:reset` de un agente
en medio de la revisión de otro invalida la medición; un `FLUSHALL` puede borrar las colas de otro
proyecto.

```ts
{ id: "api", recursos: ["postgres-local", "redis-local", "api-3000"] },
{ id: "app", recursos: ["api-3000"] },
```

Mientras un agente trabaja, tiene esos recursos tomados; cualquier otro que los pida **espera** a que
los libere (poll cada 2 s, hasta `recursosEsperaMin`, 60 min por defecto). Medido en CONTROLES.md §2. Los locks viven en
`~/.orquestador-locks`, así que valen también **entre proyectos distintos y entre corridas
simultáneas**. Si un proceso muere, el lock se detecta huérfano (pid muerto o más de una hora) y se
libera solo. Los agentes además ven en su prompt qué recursos tienen tomados.

Complemento necesario, no alternativa: `bashProhibido` para los comandos que resetean o borran esos
recursos, y los resets como tarea aparte que corrés vos.

---

## 13. Preguntar y esperar (consola o Telegram)

El problema más caro de este flujo no son las dudas calladas: son las **certezas falsas**. Un nombre
de columna inventado con total seguridad produce una medición que parece una respuesta. Por eso el
disparador de `preguntar` **no es emocional** ("ante la mínima duda") sino **estructural**: hay una
lista de cosas que el agente no puede inventar, y si no las encuentra escritas, pregunta.

### Mecanismo

El handler de la herramienta **no resuelve la promesa** hasta que llega la respuesta. No hay
conexión HTTP abierta mientras espera y no se consumen tokens: el agente sigue en el mismo turno,
con su contexto intacto, y la respuesta vuelve como resultado de la herramienta.

```
agente → preguntar({ pregunta, porQue, dondeBusque, opciones?, recomendacion? })
         ⏸ tarea pausada
vos    → botón o reply en Telegram
         ▶ respuesta → decisiones.md → vuelve citada → el agente continúa
```

### La lista chequeable (se inyecta sola en el prompt de todos)

Hay que preguntar antes de inventar: **(1)** nombres de cosas que ya existen —tablas, columnas,
enums, endpoints, claves de Redis, variables de entorno, scripts de npm—; **(2)** reglas de negocio
—plata, saldos, estados, documentos fiscales—; **(3)** cualquier cosa irreversible; **(4)** una tarea
que admite dos lecturas con implementaciones distintas; **(5)** alcance que crece más allá de lo que
la tarea nombra.

Y al revés: no se pregunta por estilo, nombres internos nuevos, orden de los tests, ni por nada que
se responde leyendo un archivo a mano. El freno contra la pregunta perezosa es el campo **`dondeBusque`: cada entrada tiene que ser una ruta
que existe** en la carpeta del agente, sus lecturas extra o el proyecto. Un campo de texto libre se
satisface de mentira en dos segundos; una ruta inexistente se rechaza (medido en CONTROLES.md §1).
Lo que la validación no prueba es que el archivo haya sido leído, solo que existe. La
mayoría de las preguntas flojas se auto-responden mientras se escribe ese campo.

### Fase 0

Con `preguntas.fase0: true` (por defecto), el agente tiene instrucción de juntar todo lo que no
puede resolver y preguntarlo **antes de escribir código**. Doce preguntas repartidas en dos horas
son doce interrupciones; las mismas doce al principio son un mensaje.

Hay una segunda razón, más fuerte: **una pregunta tardía cuesta más que la misma pregunta al
principio**. La espera no consume tokens, pero una pausa larga pierde el caché de prompt, y el turno
reanudado repaga el input completo sobre todo lo acumulado. Al planificar el contexto es chico
—la tarea y los docs—, así que aparcar ahí es barato; aparcar en el minuto 90 congela una
conversación grande y la repaga entera. Eso también está en el prompt de los agentes. Efecto lateral útil: una tarea
que genera ocho preguntas en fase 0 está mal escrita, y lo ves antes de gastar la hora.

### Las respuestas van a `decisiones.md`

Cada respuesta se escribe en `decisiones.md` de la raíz del proyecto con id y fecha, y se le
devuelve al agente **citada con ese id** para que la referencie en el reporte. Y no es una convención:
antes de tocar Telegram, **el handler busca en `decisiones.md`**; si encuentra una decisión parecida
se la devuelve al agente ahí mismo, citada, sin molestar a nadie. Para volver a preguntar tiene que
insistir explícitamente (`insistir: true`) diciendo qué le falta a esa decisión. Si la respuesta vive solo en
Telegram, el próximo agente pregunta lo mismo: lo que no está escrito, no pasó.

### Timeout: aparcar, nunca adivinar

Sin respuesta dentro de `timeoutMin`, el agente **no sigue con su mejor criterio**. Termina el turno,
la tarea queda en estado `aparcada` (con su cola, sus sesiones y la pregunta pendiente en el JSON) y
los recursos exclusivos se liberan.

```bash
npm run reanudar -- -p pedidos -t <tareaId> --ver            # ver la pregunta pendiente
npm run reanudar -- -p pedidos -t <tareaId> -r "después del IVA, sobre el subtotal gravado"
```

Al reanudar, la respuesta se registra en `decisiones.md` y se le inyecta al agente, que continúa su
sesión (`resume`) con todo su contexto.

**Lo que NO hace:** despachar otra tarea mientras una está aparcada. El orquestador corre una tarea
por invocación; no hay planificador. Correr dos invocaciones a la vez **no** es el reemplazo: si
comparten base, el lock de `recursos` las serializa (medido, ver CONTROLES.md §2), pero eso es una
red de contención, no un plan — la guarda depende de que alguien haya declarado bien los recursos de
los dos lados.

### Telegram

```
TELEGRAM_BOT_TOKEN=123456:ABC...        # de @BotFather
TELEGRAM_CHAT_ID=-1001234567890         # el grupo
TELEGRAM_TOPICS=api=12,app=34,portal=56 # un topic por agente (opcional)
```

- **Un topic por agente**: se ve de quién es cada pregunta sin leer el texto.
- **El mensaje trae**: id, agente, repo, tarea, la pregunta, qué se bloquea, dónde buscó, y la
  recomendación si la hay —que se muestra pero **no se ejecuta sola**.
- **Cerradas (2 a 4 opciones) → botones inline.** Tres toques en el celular.
- **Abiertas → reply al mensaje.** El `reply_to_message_id` correlaciona sin ambigüedad; también
  sirve escribir `DEC-xxx tu respuesta`. Un mensaje suelto en el grupo no se toma como respuesta, así
  dos preguntas abiertas simultáneas no se cruzan.
- Las aprobaciones de `sensibles` van por su propio camino con botones Sí/No. `preguntar` es para lo
  que falta **saber**; `sensibles` para lo que falta **permiso**.

### El costo, dicho

Esto serializa el flujo alrededor tuyo: con tres agentes y una sola persona contestando, tu tiempo
de respuesta es el límite del sistema. La razón para aceptarlo es que acá una definición inventada
cuesta más que una espera. Un agente detenido cuesta minutos; uno que inventó el nombre de una
columna produce una medición falsa que se toma por verdadera.

Los diales para cuando canse: `maxPorTarea`, `fase0`, y sacar `preguntar` de los agentes cuyo
trabajo sea mecánico.

---

## 14. Spec-driven

> Si es tu primera vez, [TUTORIAL.md](./TUTORIAL.md) recorre un proyecto nuevo de punta a punta.

Encaja porque resuelve la causa de la mayoría de las preguntas: **una tarea sin especificar**. Pero
solo sirve si algo mecánico lee la spec; si no es más que un documento que se pudre y nadie abre.

### Cómo se arma

```ts
spec: { dir: "specs/{feature}", archivoTareas: "tareas.md", agente: "spec" },
```

Con eso puesto:

- Un agente `spec` produce `requisitos.md`, `diseño.md` y `tareas.md` con ids (`T-01`, `T-02`).
  **No tiene acceso de escritura al código**, así que no puede resolver implementando: solo escribe
  y pregunta. Su `contrato.requiereCambiosEn` exige requisitos y tareas.
- Los agentes de implementación llevan `specs/` en `lecturaExtra`: leen el contrato, no lo escriben.
- **`entrega_lista` exige citar los ids que cubre la entrega, y los valida contra `tareas.md`.** Un id
  inventado se rechaza, igual que una ruta inventada en `dondeBusque`. Si lo que hizo no está en la
  spec, no puede cerrar: eso es un cambio de spec, y un cambio de spec es una decisión.

### El orden que sale

```
npm run tarea -- -p demo -f pedidos -a spec  "Especificar pedidos con estados"
   ⏸ el agente spec pregunta todo lo que no está definido  → decisiones.md
   ✅ specs/pedidos/{requisitos,diseño,tareas}.md

npm run tarea -- -p demo -f pedidos -a api   "Implementar T-01 a T-04"
   ✅ entrega citando T-01..T-04 (validados) + docs/pedidos actualizado
```

La fase 0 deja de ser "unas preguntas antes de codear" y pasa a ser **la etapa de spec entera**, que
es donde el contexto es más chico y preguntar sale más barato.

### Dónde puede salir mal

- **Spec como ritual.** Si nadie valida contra ella, es peor que no tenerla: da la sensación de que
  algo está definido. La validación de ids es el mínimo que la vuelve real.
- **Spec que se arregla sola.** Si el agente de implementación puede editar la spec, la spec pasa a
  decir lo que él hizo. Por eso `specs/` es `lecturaExtra` y no su `raiz`.
- **Tareas sin criterio de aceptación.** Un id que no dice cómo se verifica es un casillero para
  tildar, no una tarea.
- **Spec que envejece.** Al terminar una feature, o la spec refleja lo implementado o hay que decir
  que quedó obsoleta. Un `verificar-spec.sh` que compare tareas cerradas contra el estado real es el
  siguiente mecanismo, pero antes conviene medir si hace falta.

### Qué pasa con las decisiones

`decisiones.md` y la spec se complementan: la spec es el **antes** (qué hay que hacer), las
decisiones son el **durante** (qué se resolvió cuando la spec no alcanzó). Si una decisión cambia lo
que la spec dice, la spec se actualiza en la misma tarea; si no, la próxima feature parte de un
documento que ya sabés que miente.

---

## 15. Adopción sugerida

No habilites todo de una. El orden que baja el riesgo:

1. **Un solo agente**, con sus verificaciones y su contrato. Sin `solicitar_a` (es el único agente,
   así que la herramienta no tiene destino). Es la mayor parte del beneficio con poco riesgo.
2. **Sumar el segundo** con `lecturaExtra` al contrato del primero, todavía sin pedirle nada.
3. **Habilitar `solicitar_a`**, con las `reglasEscalada` puestas.
4. **El resto de los agentes**, de a uno.

Y mientras compartan base: nunca en paralelo. La secuencialidad no es una limitación acá, es el
arreglo.

---

## 16. Límites conocidos

- La ejecución es **secuencial**: un agente por vez. Con recursos compartidos (base, Redis, puertos) eso es una ventaja, no una limitación.
- No hay reanudación de tareas: si cortás el proceso, quedan las sesiones en el JSON pero hay que relanzar.
- Un agente puede pedirle a varios en el mismo turno, y va a ser retomado una vez por cada respuesta.
- El costo que se muestra es el que informa el SDK; con suscripción es una estimación.
- Las condiciones de uso del Agent SDK con planes de suscripción pueden cambiar:
  https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan

## 17. Próximos pasos sugeridos

- `--reanudar <tareaId>` usando las sesiones guardadas.
- Ejecución en paralelo, solo para agentes que no compartan ningún `recurso`.
- Aviso por WhatsApp o Slack cuando una tarea se detiene o pide aprobación.
- Un `contrato.validar` como función, para casos que un glob no cubre.
- Más plantillas: Expo, Astro, Go, Spring Boot.

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

**El coordinador no es un agente.** Es código: una cola, reglas y validadores. Los agentes deciden;
el orquestador solo hace cumplir. Un modelo coordinando a otros olvida estado, da por hecha una
tarea que no lo está, o resuelve él lo que debería delegar.

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

> **No escribas nada en la terminal donde corre el orquestador.** Con el canal de consola activo, lo
> que tipees ahí se toma como respuesta a la pregunta abierta. Usá otra pestaña para tus comandos.

### Cuánto cuesta (medido en un proyecto real)

Con Opus para el agente de spec y Sonnet para los de implementación:

| Tipo de corrida | Costo |
|---|---|
| Especificar una feature | 1,50 a 3 dólares |
| Conciliar la spec con algo nuevo | 2,50 a 3,50 |
| Implementar una tarea acotada | 0,70 a 4 |
| Implementar cuatro tareas juntas | 10, y se quedó sin turnos |
| Corrección puntual de presentación | 0,70 |

La conclusión práctica: **una o dos tareas por corrida**. No es solo el tope de turnos — una corrida
larga acumula contexto y termina decidiendo lo último con toda la conversación anterior encima. Sale
más cara y razona peor.

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
3. Crea las carpetas de `plantilla.carpetas` (con `.gitkeep`).
4. Inicializa el repo git si no existe, **escribiendo antes el `.gitignore`** (sin eso, el commit
   inicial se lleva `node_modules` puesto).
5. Crea las carpetas fijas del contrato (ej: `docs/` a partir de `docs/{feature}/**`).
6. Escribe un `CLAUDE.md` inicial con las reglas del agente y, si hay, sus `convenciones`.
7. Sugiere los comandos de `verificacion` si no los pusiste.

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
  carpetas: ["src/core/helpers", "src/modules"],  // estructura desde el día uno
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

---

## 5. Dónde corre cada agente

Cada agente se ejecuta **dentro de su propia carpeta** (`cwd = raiz`), igual que si abrieras una
terminal ahí y corrieras `claude`. El orquestador es solo el proceso que coordina; no aporta contexto.

Eso significa que, por cada agente, se carga:

- el `CLAUDE.md` de su repo (y los de las carpetas superiores, útil en monorepo), incluidos los
  archivos que ese `CLAUDE.md` importe con `@ruta`,
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
  maxTurnos: 200,              // 60 alcanza para especificar, no para implementar
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
| `maxTurnos` | number | 60 | Tope de turnos internos por ejecución. **Para implementar, subilo a 200**: con 60 una tarea mediana muere con `Reached maximum number of turns` |
| `maxIntentosVerificacion` | number | 2 | Reintentos cuando falla un comando de verificación |
| `sensibles` | RegExp[] | `[]` | Si la solicitud matchea, te pide aprobación |
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
| `convenciones` | string | — | Archivo `.md` (dentro de `prompts/`) con las convenciones de arquitectura; se vuelca al `CLAUDE.md` del repo en el init |
| `lecturaExtra` | string[] | `[]` | Carpetas que puede leer sin escribir (contratos ajenos) |
| `verificacion` | `(string\|objeto)[]` | `[]` | Comandos que corre el orquestador tras cerrar |
| `verificacion[].reintentar` | boolean | `true` | `false` = si falla, se detiene en vez de reintentar |
| `contrato.requiereCambiosEn` | string[] | `[]` | Globs que deben tener cambios para poder cerrar |
| `contrato.cuando` | `"siempre"\|"si-cambia"` | `siempre` | Exigir el contrato solo si se tocaron los `disparadores` |
| `contrato.disparadores` | string[] | `[]` | Globs que activan el contrato condicional |
| `contrato.mensajeRechazo` | string | genérico | Lo que ve el agente si no cumple |
| `plantilla.tipo` | ver tabla | — | Con qué generar la carpeta en `npm run init` |
| `plantilla.opciones` | string[] | `[]` | Flags extra para el generador |
| `plantilla.carpetas` | string[] | `[]` | Carpetas a crear al inicializar (con `.gitkeep`) |
| `plantilla.postInstalacion` | string[] | `[]` | Comandos dentro del proyecto recién creado |
| `plantilla.generarClaudeMd` | boolean | `true` | Crear un CLAUDE.md inicial |
| `bashProhibido` | RegExp[] | `[]` | Comandos extra bloqueados para ese agente |
| `recursos` | string[] | `[]` | Recursos externos que toma en exclusiva (base, Redis, puerto) |
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
  convenciones: "convenciones/nestjs-modular.md",
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
  verificacion: ["uv run ruff check .", "uv run pytest -q"],
  contrato: { requiereCambiosEn: ["openapi.json"] },
  bashProhibido: [/alembic\s+downgrade/] }
// Django: verificacion: ["uv run python manage.py check", "uv run pytest -q"]
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

## 9. Convenciones que se vuelven mecanismos

Una convención escrita en un prompt se cumple casi siempre. Un chequeo se cumple siempre. El
criterio para elegir qué mecanizar: **que el chequeo no se pueda satisfacer de mentira.**

**1. Las convenciones van al repo, no al orquestador.** El campo `convenciones` vuelca un archivo de
arquitectura al `CLAUDE.md` del proyecto durante el init. Desde ahí lo lee cualquier agente que
trabaje en ese repo, con o sin orquestador.

```ts
{ id: "api", convenciones: "convenciones/nestjs-modular.md", ... }
```

**2. Al menos una regla se vuelve script.** De las siete reglas de arquitectura de un monolito
modular, la más importante se puede verificar: que `core` no importe de `modules`, y que un módulo
no importe el service de otro.

```ts
verificacion: [
  "npm run build",
  "npm test",
  { comando: "npm run arq:verificar", reintentar: false,
    descripcion: "violación de la arquitectura modular" },
]
```

`reintentar: false` a propósito: una violación de arquitectura no es un typo que se arregla a
ciegas; es código mal ubicado, y conviene que la tarea se detenga para que lo mires.

**3. Los contratos generados se verifican contra el código.** Si el `openapi.yaml` se genera de los
controladores, sumá un test que falle cuando el archivo versionado quedó desactualizado — y otro que
verifique que generarlo dos veces produce lo mismo, porque si no el primero se pone rojo solo y
alguien lo termina desactivando.

**4. Los gates no arrancan en rojo.** Un verificador de diccionarios que falle por los idiomas que
todavía no se cargaron está en rojo desde el día uno y nadie lo sostiene. Que falle solo por lo que
está activo y liste el resto sin fallar.

**5. Los pendientes se marcan y bloquean.** Si la spec permite `[NEEDS CLARIFICATION: ...]`, un grep
en `verificacion` impide cerrarla con huecos.

---

## 10. Recursos externos compartidos

El límite de escritura de un agente es su carpeta, pero eso no cubre lo que comparten por fuera
del filesystem: una base, un Redis, un puerto, un entorno de demo. Un `db:demo:reset` de un agente
en medio de la revisión de otro invalida la medición; un `FLUSHALL` puede borrar las colas de otro
proyecto.

```ts
{ id: "api", recursos: ["postgres-local", "redis-local", "api-3000"] },
{ id: "app", recursos: ["api-3000"] },
```

Mientras un agente trabaja, tiene esos recursos tomados; cualquier otro que los pida **espera** a que
los libere (poll cada 2 s, hasta `recursosEsperaMin`, 60 min por defecto). Medido en CONTROLES.md §2.
Los locks viven en `~/.orquestador-locks`, así que valen también **entre proyectos distintos y entre
corridas simultáneas**. Si un proceso muere, el lock se detecta huérfano (pid muerto o más de una
hora) y se libera solo. Los agentes además ven en su prompt qué recursos tienen tomados.

Complemento necesario, no alternativa: `bashProhibido` para los comandos que resetean o borran esos
recursos, y los resets como tarea aparte que corrés vos.

---

## 11. Lo que el orquestador NO reemplaza

Automatiza el traspaso entre agentes y la exigencia de los gates. **No automatiza la crítica.**
Un lazo de verificación no detecta un test que verifica un camino inexistente, un mock sin stub,
ni una decisión registrada como cerrada que nunca se implementó. Eso lo detecta alguien leyendo
el reporte con la pregunta "¿esto prueba lo que dice que prueba?".

Y hay una categoría que ningún mecanismo cubre: **los errores caros no son dudas calladas, son
certezas falsas.** Un nombre de columna inventado con total seguridad, una medición que parece una
respuesta. Por eso el diseño ataca la invención, no la duda.

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

Caso real: un contrato que exigía `docs/**` en toda entrega dejaba sin poder cerrar una tarea de
infraestructura que no tocaba ningún endpoint.

```ts
contrato: {
  cuando: "si-cambia",
  disparadores: ["src/**/*.controller.ts", "prisma/schema.prisma"],
  requiereCambiosEn: ["docs/{feature}/**"],
}
```

---

## 12. Dónde va el trabajo que no es de ninguna feature

Refactors, limpieza de scaffold, gates de arquitectura, deuda técnica: no pertenecen a la spec de
ninguna funcionalidad y no tienen id. Si los metés igual, terminás con tareas de infraestructura
dentro de la spec del catálogo, o con trabajo hecho que ninguna tarea cubre.

La solución es una feature propia:

```
specs/
├── publicaciones/      la funcionalidad
│   ├── requisitos.md
│   ├── diseño.md
│   └── tareas.md
└── mantenimiento/      trabajo técnico, ids M-01, M-02...
    ├── requisitos.md   qué entra acá y qué no
    └── tareas.md
```

```bash
npm run tarea -- -p mi-proyecto -f mantenimiento -a api "Implementá M-01 y M-02."
```

Los ids con otro prefijo (`M-` en vez de `T-`) no son un requisito técnico —el validador lee el
`tareas.md` de cada feature por separado— pero al leer un commit sabés de qué carpeta sale sin
abrir nada.

Regla para adelante: el trabajo técnico se especifica acá **desde el principio**, no se reclasifica
después. Mover trabajo ya cerrado de una feature a otra solo duplica ids.

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
vos    → botón o texto en Telegram, o bloque en la consola
         ▶ respuesta → decisiones.md → vuelve citada → el agente continúa
```

Si el canal falla, el agente **no** sigue con su mejor criterio: recibe la instrucción de registrar
el bloqueo con `no_se_puede`. Un error de configuración no debería poder cambiar quién decide.

### La lista chequeable (se inyecta sola en el prompt de todos)

Hay que preguntar antes de inventar: **(1)** nombres de cosas que ya existen —tablas, columnas,
enums, endpoints, claves de Redis, variables de entorno, scripts de npm—; **(2)** reglas de negocio
—plata, saldos, estados, documentos fiscales—; **(3)** cualquier cosa irreversible; **(4)** una tarea
que admite dos lecturas con implementaciones distintas; **(5)** alcance que crece más allá de lo que
la tarea nombra.

Y al revés: no se pregunta por estilo, nombres internos nuevos, orden de los tests, ni por nada que
se responde leyendo un archivo a mano. El freno contra la pregunta perezosa es el campo
**`dondeBusque`: cada entrada tiene que ser una ruta que existe** en la carpeta del agente, sus
lecturas extra o el proyecto. Un campo de texto libre se satisface de mentira en dos segundos; una
ruta inexistente se rechaza (medido en CONTROLES.md §1). Lo que la validación no prueba es que el
archivo haya sido leído, solo que existe. La mayoría de las preguntas flojas se auto-responden
mientras se escribe ese campo.

### Cómo contestar bien

- **Corto y decidido.** "Tipos separados: casa, departamento y rural." Una respuesta que abre otra
  discusión cuesta otra pregunta.
- **"Usá tu criterio" desarma el mecanismo entero.** Si no sabés, la respuesta correcta es *"no sé
  todavía, dejalo fuera de alcance y anotalo como pendiente"*.
- **Por un solo canal.** Con `canal: "ambos"`, si contestás por consola y además mandás el texto por
  Telegram, el segundo mensaje queda en la cola y se toma como respuesta de la pregunta siguiente.
- **Nunca en la terminal del orquestador.** Lo que tipees ahí se toma como respuesta.
- **Cuando la serie se alarga, dale la regla en vez del caso.** Si te pregunta campo por campo,
  respondé con el principio ("todo texto de interfaz va en el idioma activo; todo texto de contenido
  va en su idioma con respaldo al español; aplicá esto a cualquier caso nuevo") y la serie se corta.
- **Una funcionalidad transversal se define en un bloque.** Descubrirla de a poco multiplica las
  preguntas: lo mismo que se resuelve en tres definidas de entrada puede costar nueve.

### Fase 0

Con `preguntas.fase0: true` (por defecto), el agente tiene instrucción de juntar todo lo que no
puede resolver y preguntarlo **antes de escribir código**. Doce preguntas repartidas en dos horas
son doce interrupciones; las mismas doce al principio son un mensaje.

Hay una segunda razón, más fuerte: **una pregunta tardía cuesta más que la misma pregunta al
principio**. La espera no consume tokens, pero una pausa larga pierde el caché de prompt, y el turno
reanudado repaga el input completo sobre todo lo acumulado. Al planificar el contexto es chico
—la tarea y los docs—, así que aparcar ahí es barato; aparcar en el minuto 90 congela una
conversación grande y la repaga entera. Efecto lateral útil: una tarea que genera ocho preguntas en
fase 0 está mal escrita, y lo ves antes de gastar la hora.

### Las respuestas van a `decisiones.md`

Cada respuesta se escribe en `decisiones.md` de la raíz del proyecto con id y fecha, y se le
devuelve al agente **citada con ese id** para que la referencie en el reporte. Y no es una
convención: antes de tocar el canal, **el handler busca en `decisiones.md`**; si encuentra una
decisión parecida se la devuelve al agente ahí mismo, citada, sin molestar a nadie. Para volver a
preguntar tiene que insistir explícitamente (`insistir: true`) diciendo qué le falta a esa decisión.

Efecto secundario valioso: como las decisiones se citan, **se contradicen a la vista**. En el
proyecto real un agente encontró que dos decisiones registradas, juntas, hacían que ninguna ficha
rural se anunciara en alemán, y preguntó en vez de elegir una. Sin ese archivo, eso se descubre en
producción.

### Timeout: aparcar, nunca adivinar

Sin respuesta dentro de `timeoutMin`, el agente **no sigue con su mejor criterio**. Termina el turno,
la tarea queda en estado `aparcada` (con su cola, sus sesiones y la pregunta pendiente en el JSON) y
los recursos exclusivos se liberan.

```bash
npm run reanudar -- -p pedidos -t <tareaId> --ver            # ver la pregunta pendiente
npm run reanudar -- -p pedidos -t <tareaId> -r "después del IVA, sobre el subtotal gravado"
```

Al reanudar, la respuesta se registra en `decisiones.md` y se le inyecta al agente junto con su
propia pregunta, el `porQue` y el `dondeBusque`, para que retome sin rehacer el análisis.

**Lo que NO hace:** despachar otra tarea mientras una está aparcada. El orquestador corre una tarea
por invocación; no hay planificador. Correr dos invocaciones a la vez **no** es el reemplazo: si
comparten base, el lock de `recursos` las serializa (medido, ver CONTROLES.md §2), pero eso es una
red de contención, no un plan — la guarda depende de que alguien haya declarado bien los recursos de
los dos lados.

### Telegram

```
TELEGRAM_BOT_TOKEN=123456:ABC...        # de @BotFather, con el id del bot antes de los dos puntos
TELEGRAM_CHAT_ID=987654321              # tu chat, o el grupo (con el signo menos adelante)
TELEGRAM_TOPICS=api=12,app=34           # opcional, SOLO en grupos con temas activados
```

Para obtener el `chat_id`: escribile algo al bot y consultá `getUpdates`; el número está en
`chat.id`. Probá el envío con `sendMessage` antes de la primera corrida.

- **Las preguntas se hacen de a una**, así que cualquier texto que mandes al chat cuenta como
  respuesta. El reply al mensaje y el prefijo `DEC-xxx` siguen funcionando, pero no son obligatorios.
  Los mensajes que empiezan con `/` se ignoran.
- **Antes de cada pregunta se descarta lo que haya quedado en la cola**, para que una respuesta
  tardía de una corrida anterior no se tome como respuesta de la nueva.
- **El mensaje trae**: id, agente, repo, tarea, la pregunta, qué se bloquea, dónde buscó, y la
  recomendación si la hay —que se muestra pero **no se ejecuta sola**.
- **Cerradas (2 a 4 opciones) → botones inline**, con las opciones completas listadas en el cuerpo
  (el texto del botón se recorta a 30 caracteres, que es límite de Telegram).
- **`TELEGRAM_TOPICS` requiere un grupo con temas activados.** En un chat privado, un
  `message_thread_id` inexistente hace que Telegram rechace el envío y la pregunta no llega a
  ningún lado. Si no usás grupo, dejalo comentado.
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

### Cuando aparece algo nuevo a mitad de camino

Un diseño que trae elementos que el modelo no tiene, o un requisito transversal que se te ocurre
después. **No va en la tarea de implementación**: va a la spec, con una corrida de conciliación.

```bash
npm run tarea -- -p demo -f pedidos -a spec \
  "Conciliá la spec con <lo nuevo>. Listá cada elemento que no está en el modelo o en los requisitos
   y marcá si entra ahora, si va a una feature futura, o si se descarta. No decidas vos lo que cambia
   el modelo: preguntame. No renumeres tareas existentes."
```

Y sabé cuándo parar: cada conciliación agranda la spec. Después de dos o tres, conviene implementar
lo que hay. Lo que descubras escribiendo código vale más que otra vuelta de especificación.

### Dónde puede salir mal

- **Spec como ritual.** Si nadie valida contra ella, es peor que no tenerla: da la sensación de que
  algo está definido. La validación de ids es el mínimo que la vuelve real.
- **Spec que se arregla sola.** Si el agente de implementación puede editar la spec, la spec pasa a
  decir lo que él hizo. Por eso `specs/` es `lecturaExtra` y no su `raiz`.
- **Tareas sin criterio de aceptación.** Un id que no dice cómo se verifica es un casillero para
  tildar, no una tarea.
- **Spec que envejece.** Al terminar una feature, o la spec refleja lo implementado o hay que decir
  que quedó obsoleta.

### Qué pasa con las decisiones

`decisiones.md` y la spec se complementan: la spec es el **antes** (qué hay que hacer), las
decisiones son el **durante** (qué se resolvió cuando la spec no alcanzó). Si una decisión cambia lo
que la spec dice, la spec se actualiza en la misma tarea; si no, la próxima feature parte de un
documento que ya sabés que miente.

---

## 15. Controles de seguridad

| Control | Dónde se configura |
|---|---|
| Escritura limitada a la carpeta del agente | automático (`raiz`) |
| Comandos peligrosos bloqueados (push, `rm -rf`, SQL destructivo, scripts remotos) | `src/permisos.ts` + `bashProhibido` |
| Aprobación humana para temas sensibles | `sensibles` |
| Cierre rechazado si no se cumple el contrato | `contrato.requiereCambiosEn` |
| Build/tests antes de dar por terminado | `verificacion` |
| Reglas de arquitectura verificadas por script | `convenciones` + `verificacion` con `reintentar: false` |
| Tope de idas y vueltas | `maxSolicitudes` |
| Bloqueo del agente detiene todo | herramienta `no_se_puede` |
| Todo el trabajo en una rama aparte | `git.estrategia` |
| Exclusión sobre base, Redis o puertos compartidos | `recursos` |
| Gates cuyo verde no se consigue a fuerza de reintentos | `verificacion[].reintentar: false` |
| Decisiones que no las toma un agente | `reglasEscalada` + `no_se_puede` |
| Que no invente nombres, reglas ni alcance | herramienta `preguntar` (lista chequeable + `dondeBusque`) |
| Que las respuestas no se pierdan | `decisiones.md` con id, citado en el reporte |
| Que sin respuesta no siga adivinando | estado `aparcada` + `npm run reanudar` |
| Que un canal caído no habilite a suponer | el handler devuelve instrucción de bloquear, no de decidir |

Los agentes **no** pueden hacer commit ni cambiar de rama: eso lo hace el orquestador.

---

## 16. Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `tiene cambios sin commitear` | Limpiá el repo o poné `git.exigirLimpio: false`. Es lo que permite que el diff final muestre solo lo del agente |
| `Falta el prompt del agente "x"` | El `prompt` del config no existe en `prompts/` |
| `La raíz del agente "x" no existe` | Corré `npm run init -- -p <proyecto>` o creá la carpeta a mano |
| `Para crear "x" hace falta "uv"` | Instalá el binario del stack (uv, flutter) o cambiá la plantilla |
| `Reached maximum number of turns` | `maxTurnos` bajo (60 por defecto) o tarea demasiado grande. Subilo a 200 y partí la tarea |
| Se detiene con "terminó sin cerrar nada" | El trabajo está pero sin commitear. Commiteá como trabajo en curso y pedile que cierre, en vez de relanzar desde cero |
| Rechaza el cierre una y otra vez | El glob de `requiereCambiosEn` no matchea las rutas reales, o el contrato exige algo que esa tarea no toca: usá `cuando: "si-cambia"` |
| La verificación falla siempre | El comando no corre en la `raiz` del agente, o necesita `npm install` previo |
| Los tests dicen "N salteados" y la corrida cierra | Un salteo no es un verde. Levantá la base o el servicio que falta y corré de nuevo |
| El agente ignora mis rules o skills | `ajustes` quedó en `[]`, o el `.claude/` no está en la `raiz` del agente sino más arriba |
| `El recurso "x" está tomado por ...` | Hay otra corrida usándolo. Esperá, o borrá el `.lock` si ese proceso ya no existe |
| Una respuesta se registra en la pregunta equivocada | Contestaste por dos canales, o escribiste en la terminal del orquestador |
| La respuesta se registra cortada | Pegá en bloques cortos o usá Telegram. Verificá con `tail decisiones.md` |
| El agente frena diciendo que la consigna contradice la spec | Revisá tu consigna antes que su criterio: suele ser el error |
| Un agente hace el trabajo de otro | Falta claridad en `descripcion`, o su prompt no prohíbe los workarounds |
| Gasta demasiado | Una o dos tareas por corrida, `haiku`/`sonnet` en lo mecánico, features más chicas |

---

## 17. Límites conocidos

- La ejecución es **secuencial**: un agente por vez. Con recursos compartidos (base, Redis, puertos)
  eso es una ventaja, no una limitación.
- **No hay planificador de tareas.** Una tarea aparcada no libera el turno para otra: el orquestador
  corre una por invocación.
- **La reanudación es un turno nuevo**, no la continuación exacta del turno cortado. Si el proceso
  muere, la sesión y la cola quedan en el JSON y se retoma con `npm run reanudar` con la respuesta
  inyectada; no se pierde trabajo, pero el agente retoma releyendo lo que necesite.
- Un agente puede pedirle a varios en el mismo turno, y va a ser retomado una vez por cada respuesta.
- **Solo funciona con el Claude Agent SDK.** La coordinación, los contratos y las reglas son
  independientes del motor, pero el código que ejecuta agentes todavía no está abstraído.
- El costo que se muestra es el que informa el SDK; con suscripción es una estimación.
- Las condiciones de uso del Agent SDK con planes de suscripción pueden cambiar:
  https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan

---

## 18. Próximos pasos sugeridos

- Soporte de otros motores (Codex, Gemini) detrás de una interfaz común.
- Ejecución en paralelo, solo para agentes que no compartan ningún `recurso`.
- `maxTurnos` configurable por agente: especificar e implementar tienen necesidades muy distintas.
- Un agente `revisor`, de solo lectura, que produzca un informe de hallazgos después de cada entrega.
- Un `contrato.validar` como función, para casos que un glob no cubre.
- Más plantillas: Expo, Astro, Go, Spring Boot.
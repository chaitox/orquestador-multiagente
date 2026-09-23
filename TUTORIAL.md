# Tutorial — spec-driven con el orquestador, de cero

Vamos a crear un proyecto nuevo —el **catálogo web de propiedades**: casas, departamentos y
campos, en venta y alquiler, con contacto por WhatsApp— usando tres agentes: uno que **especifica**
y dos que **implementan**. Al terminar vas a tener una feature hecha con trazabilidad de la decisión
al código.

Es buen ejemplo porque tiene ambigüedad de verdad: un departamento amoblado, una casa de 4
dormitorios en el centro de la ciudad y un campo de 80 hectáreas con corral y pozo artesano **no se
describen con los mismos campos**. Un agente sin spec elige un modelo y sigue; con spec, pregunta.

> Este recorrido sale de haber construido el catálogo de verdad, no de un ejemplo armado para el
> tutorial. Los costos, los tropiezos y las señales de alarma que aparecen más abajo son los que
> ocurrieron. La sección 11 resume lo que costó aprender.

La primera feature completa, de la spec al sitio funcionando, lleva varias horas repartidas en
sesiones, y unos 60 dólares de consumo. Este recorrido mínimo, hasta tener la spec y el backend
arrancado, lleva entre 40 y 60 minutos.

---

## 0 · Antes de empezar

```bash
cd orquestador
npm install
npm run typecheck        # si esto falla, no sigas: arreglá primero
cp .env.example .env
```

Necesitás `git`, `node 20.12+` y Claude Code logueado (`claude` tiene que abrir).

---

## 1 · El config: un archivo, tres agentes

Creá `proyectos/catalogo.ts`:

```ts
import { defineProyecto } from "../src/tipos.js";

export default defineProyecto({
  nombre: "catalogo",
  raiz: "~/dev/catalogo",
  agentePrincipal: "spec",          // toda feature arranca especificando
  modeloPorDefecto: "sonnet",
  maxTurnos: 200,                   // implementar necesita muchos más turnos que especificar

  // Esto es lo que vuelve real el spec-driven: los ids se validan contra el archivo
  spec: { dir: "specs/{feature}", archivoTareas: "tareas.md", agente: "spec" },

  preguntas: { canal: "ambos", timeoutMin: 45, fase0: true },

  agentes: [
    {
      id: "spec",
      descripcion: "Escribe la especificación. NO toca código.",
      raiz: "specs",
      modelo: "opus",               // acá se decide, conviene el mejor modelo
      prompt: "catalogo/spec.md",
      lecturaExtra: ["api", "web"], // lee el código para no especificar contra un sistema imaginario
      plantilla: { tipo: "custom", comandos: ["mkdir -p {nombre}"] },
      verificacion: [
        // Una spec con pendientes sin resolver no se puede cerrar
        { comando: '! grep -rn "NEEDS CLARIFICATION" --include=*.md .', reintentar: false },
      ],
      contrato: {
        requiereCambiosEn: ["{feature}/requisitos.md", "{feature}/tareas.md"],
        mensajeRechazo: "Una spec sin requisitos y sin tareas no es una spec.",
      },
    },
    {
      id: "api",
      descripcion: "Backend NestJS + Prisma. Dueño del contrato: publica docs/ para el front.",
      raiz: "api",
      prompt: "catalogo/api.md",
      convenciones: "convenciones/nestjs-modular.md",
      lecturaExtra: ["specs"],
      plantilla: {
        tipo: "nestjs",
        carpetas: ["src/core/helpers", "src/core/config", "src/modules"],
      },
      verificacion: [
        "npm run build",
        "npm test -- --passWithNoTests",
        { comando: "npm run arq:verificar", reintentar: false, descripcion: "violación de la arquitectura" },
      ],
      contrato: {
        // Condicional: una tarea de infraestructura no tiene por qué tocar docs/
        cuando: "si-cambia",
        disparadores: ["src/**/*.controller.ts", "src/**/*.dto.ts", "prisma/schema.prisma"],
        requiereCambiosEn: ["docs/{feature}/**"],
      },
    },
    {
      id: "web",
      descripcion: "Sitio público en Next.js: catálogo, ficha y contacto por WhatsApp.",
      raiz: "web",
      prompt: "catalogo/web.md",
      lecturaExtra: ["specs", "api/docs"],
      plantilla: { tipo: "nextjs" },
      verificacion: ["npm run lint", "npm run build"],
    },
  ],

  // Precios y datos del propietario no se deciden solos
  sensibles: [/precio/i, /moneda/i, /comisi[oó]n/i, /due[ñn]o/i, /propietario/i],

  reglasEscalada: [
    "La spec manda. Si la spec no lo dice, no lo decidas vos: preguntar o no_se_puede.",
    "Si al implementar descubrís que la spec está mal, pará. Cambiar la spec es una decisión.",
  ],
});
```

**Por qué cada cosa:**

| Decisión | Razón |
|---|---|
| `spec` con `raiz: "specs"` y sin acceso a `api`/`web` | Si pudiera escribir código, "resolvería" la ambigüedad implementando en vez de preguntando |
| `lecturaExtra: ["api", "web"]` en spec | Para que los nombres de tablas y endpoints salgan del código, no de su cabeza |
| `spec.dir` en el proyecto | Activa la validación de ids al cerrar entregas |
| `contrato` del spec | Sin requisitos y sin tareas, el cierre se rechaza (vale también con `tarea_completa`) |
| `contrato` de api **condicional** | Sin `cuando: "si-cambia"`, una tarea de infraestructura no puede cerrar porque no tocó `docs/`. Un requisito que a veces no corresponde enseña a fabricar el cambio |
| `maxTurnos: 200` | Con 60 (el default) una tarea de implementación se queda sin turnos a mitad de camino |
| `canal: "ambos"` | Si Telegram falla, la pregunta igual aparece en la terminal. Con un solo canal, una pregunta perdida es una decisión que nadie tomó |
| `sensibles` con precio y moneda | Son las decisiones que no querés que se resuelvan solas |

---

## 2 · Los prompts

`prompts/catalogo/spec.md` (creálo vos; `prompts/spec/spec.md` es un punto de partida):

```markdown
# Agente "spec"

No escribís código. Para la feature pedida producís:

- `<feature>/requisitos.md` — qué tiene que pasar, observable. Nada de implementación.
- `<feature>/diseño.md` — cómo, con las decisiones y las alternativas descartadas.
- `<feature>/tareas.md` — tareas `T-01`, `T-02`... cada una con criterio de aceptación
  y el agente que la implementa (`api` o `web`).

## Contexto del negocio
Agencia que publica casas, departamentos y propiedades rurales, en venta y alquiler;
los interesados contactan por WhatsApp.

## Reglas
- Leé el código existente antes de especificar.
- Una tarea sin criterio de aceptación no es una tarea.
- Cuidado con lo que varía entre tipos: una casa tiene dormitorios, un campo tiene hectáreas.
  No fuerces un modelo único sin preguntarlo.
- Precios, monedas y datos de contacto del propietario no se inventan.
- Los ids son estables: no los renumeres después, porque las entregas los citan.
- Todo lo que no puedas resolver leyendo, preguntalo acá: es el momento más barato.
- Si algo queda sin definir y no se puede preguntar, escribilo como
  `[NEEDS CLARIFICATION: qué falta]`. La spec no puede cerrarse con marcadores pendientes.
```

`prompts/catalogo/api.md` y `web.md`:

```markdown
# Agente "api" (o "web")

Trabajás por tareas de la spec. Leé `specs/<feature>/` antes de empezar.

## Reglas
- Implementá solo las tareas pedidas. Lo que falte y no esté en la spec es un hallazgo.
- Al cerrar citá los ids que cubriste: se validan contra tareas.md.
- Si la spec está equivocada, no la corrijas ni implementes otra cosa: pará y preguntá.
```

---

## 3 · Crear el proyecto

```bash
npm run init -- -p catalogo --simular    # mirá los comandos primero
npm run init -- -p catalogo
```

Crea `~/dev/catalogo/{specs,api,web}`, inicializa los repos git con su `.gitignore`, crea las
carpetas de la estructura y del contrato, y escribe un `CLAUDE.md` en cada uno con las convenciones.

Después del init, entrá a `api` y `web` y aprobá los scripts de instalación que npm deje pendientes.

---

## 4 · Especificar

```bash
npm run tarea -- -p catalogo -f publicaciones \
  "Catálogo público de propiedades: casas, departamentos y campos, en venta o alquiler, \
   con fotos, características y botón de contacto por WhatsApp."
```

El agente lee el código y **antes de escribir la spec** pregunta lo que no puede resolver. Con este
dominio, las preguntas que van a salir son reales:

- **Tipos de propiedad y sus campos.** ¿Un modelo único con campos opcionales, o tipos separados?
  Es la decisión de diseño más cara de la feature y no se adivina.
- **Medidas del terreno.** `10 x 50`, `500 m²` y `80 hectáreas` no son la misma unidad.
- **Precio.** ¿Opcional? ¿"Consultar"? ¿En qué moneda? (Va a pedirte aprobación: está en `sensibles`.)
- **Ubicación, estado legal, contacto, medios.**
- **Dónde viven los videos.** Un recorrido con drone pesa más que todas las fotos juntas.
- **Consumo de datos.** ¿El video carga solo al entrar, o cuando lo piden?
- **Alcance.** ¿Entra el panel de carga, o solo el sitio público?

**Cómo contestar, que es la mitad del trabajo:**

Corto y decidido. "Tipos separados: casa, departamento y rural." "El precio es opcional; si no está,
se muestra 'Consultar'."

Si no sabés, decilo: *"no sé todavía, dejalo fuera de alcance y anotalo como pendiente"* es una
respuesta válida y evita que invente.

**Lo que no hay que contestar nunca es "usá tu criterio":** eso desarma el mecanismo entero.

**Respondé por un solo canal.** Con `canal: "ambos"`, si contestás por consola y además mandás el
texto por Telegram, el segundo mensaje queda en la cola y se toma como respuesta de la pregunta
siguiente.

**No escribas nada en la terminal donde corre el orquestador.** Si tenés que correr un comando, usá
otra pestaña: lo que tipees ahí se toma como respuesta a la pregunta abierta.

**Cuando una pregunta tiene opciones**, podés tocar el botón o escribir. Una respuesta que corrige
la opción recomendada es tan válida como elegir una.

Cada respuesta queda en `~/dev/catalogo/decisiones.md` con su id, y el agente la consulta antes de
volver a preguntar.

---

## 5 · Revisar la spec (este paso es tuyo, no se automatiza)

```bash
cat ~/dev/catalogo/specs/publicaciones/requisitos.md
cat ~/dev/catalogo/specs/publicaciones/tareas.md
```

Checklist para rechazar:

- [ ] ¿Hay requisitos que en realidad son implementación?
- [ ] ¿Cada tarea tiene criterio de aceptación verificable? Si dice "que funcione bien", no sirve
- [ ] ¿Hay algo que vos no decidiste y aparece decidido igual? Eso es una invención que se coló
- [ ] ¿Las tareas dicen qué agente las hace?
- [ ] ¿Las respuestas que diste están reflejadas en la spec, o solo en `decisiones.md`?

**No arranques a implementar sobre una spec que no leíste**: el resto del flujo va a ejecutar
fielmente lo que diga.

Señal útil: si la feature generó ocho preguntas, la pedida era ambigua, y eso está bien: es la etapa
donde salen baratas. Si generó cero, o el agente no está preguntando o la feature no necesitaba spec.

---

## 6 · Cuando aparece algo nuevo a mitad de camino

Va a pasar: el diseño trae elementos que el modelo no tiene, o se te ocurre que el sitio debería ser
multilenguaje. **No lo metas en la tarea de implementación.** Va a la spec, con una corrida de
conciliación:

```bash
npm run tarea -- -p catalogo -f publicaciones -a spec \
  "Conciliá la spec con <lo nuevo>. Listá cada elemento que no está en el modelo o en los
   requisitos y marcá si entra ahora, si va a una feature futura, o si se descarta.
   No decidas vos lo que cambia el modelo: preguntame. No renumeres tareas existentes."
```

Dos cosas que aprendimos ahí:

**Dale la regla, no el caso.** Si respondés caso por caso, te va a preguntar por cada campo. Una
respuesta del tipo *"todo texto de interfaz va en el idioma activo; todo texto de contenido va en su
idioma con respaldo al español; aplicá esta distinción a cualquier caso nuevo"* corta la serie.

**Una funcionalidad transversal se define en un bloque, no por descubrimiento.** El multilenguaje
generó nueve preguntas encadenadas porque llegó de a poco. Definido de entrada, habrían sido tres.

**Y parar a tiempo.** Cada conciliación agranda la spec. Después de dos o tres, conviene implementar
lo que hay: lo que descubras escribiendo código vale más que otra vuelta de especificación.

---

## 7 · Implementar, y de a poco

```bash
npm run tarea -- -p catalogo -f publicaciones -a api \
  "Implementá T-01 y T-02 de specs/publicaciones/tareas.md. Nada más."
```

**Una o dos tareas por corrida, no cinco.** No es solo el tope de turnos: una corrida larga acumula
contexto y termina decidiendo el seed con toda la conversación de la infraestructura encima. Sale
más cara y razona peor. Cuatro corridas cortas cuestan menos que una larga, y si una sale mal
revisás sin arrastrar el resto.

**Costos reales medidos** (Opus para spec, Sonnet para implementar):

| Tipo de corrida | Costo |
|---|---|
| Especificar una feature | 1,50 a 3 dólares |
| Conciliar la spec | 2,50 a 3,50 |
| Implementar una tarea acotada | 0,70 a 4 |
| Implementar cuatro tareas juntas | 10, y se quedó sin turnos |
| Una corrección puntual de presentación | 0,70 |

**Si una corrida termina sin cerrar**, el trabajo está pero sin commitear. Commiteá como trabajo en
curso y pedile que cierre, en vez de relanzar desde cero:

```bash
git -C ~/dev/catalogo/api add -A && git -C ~/dev/catalogo/api commit -m "T-06 en progreso"
npm run tarea -- -p catalogo -f publicaciones -a api \
  "La corrida anterior dejó el trabajo hecho pero terminó sin cerrar. Revisá lo que hay, corré las
   verificaciones, completá lo que falte y cerrá con tarea_completa citando T-06. Si algo no se puede
   resolver, cerralo con no_se_puede: no termines sin usar una herramienta de cierre."
```

---

## 8 · Convertir convenciones en mecanismos

Una convención escrita en el prompt se cumple casi siempre. Un chequeo se cumple siempre.

Lo que hicimos en el proyecto real, y que conviene repetir:

**Arquitectura**: las reglas van al `CLAUDE.md` del repo (así las lee cualquier agente, no solo el
orquestador) y **una de ellas se vuelve script**: `arq:verificar` falla si `core` importa de
`modules` o si un módulo importa el service de otro. Va a `verificacion` con `reintentar: false`.

**Contrato de API**: el `openapi.yaml` se **genera** del código, y hay un test que falla si el
archivo versionado quedó desactualizado. Más otro que verifica que generarlo dos veces dé lo mismo,
porque si no el primer test se pone rojo solo y alguien lo desactiva.

**Diccionarios**: `i18n:verificar` falla por claves faltantes **solo en idiomas activos**, y lista
los inactivos sin fallar. Un gate que está en rojo desde el día uno no sobrevive.

**Pendientes de la spec**: el grep de `NEEDS CLARIFICATION` impide cerrar con huecos.

El criterio para elegir qué mecanizar: **que el chequeo no se pueda satisfacer de mentira.** Un
campo de texto libre que pide "dónde buscaste" se completa en dos segundos sin haber buscado; el
mismo campo validado contra rutas que existen, no.

---

## 9 · Revisar el resultado

```bash
cd ~/dev/catalogo/api && git log --oneline agente/publicaciones
git diff main...agente/publicaciones

cat ~/dev/catalogo/decisiones.md
cat orquestador/.orquestador/catalogo/*.json       # historial, costo, preguntas, verificaciones
```

Las tres preguntas para leer el diff, que ningún mecanismo contesta por vos:

1. ¿El código hace lo que dice la tarea que citó?
2. ¿Los tests prueban lo que dicen probar, o solo pasan?
3. ¿Hay algo que se decidió sin preguntar?

**Y para el front, mirar la pantalla.** Levantá el sitio y abrilo a 360 píxeles de ancho. Ningún
test te va a decir que los filtros se comen la primera pantalla, que un campo deshabilitado parece
roto, o que la página quedó blanca y negra teniendo los colores definidos.

**Cuidado con los tests que se saltean.** Si la suite dice "79 tests salteados porque no hay base",
eso no es verde: es no haber probado. Levantá la base y corré de nuevo.

---

## 10 · Diseño: que no salga una pantalla genérica

Sin dirección visual, el agente produce el promedio de lo que vio: tarjetas blancas iguales,
etiquetas en mayúsculas sobre cada campo, todo con el mismo peso.

Lo que funcionó:

1. **Diseñar primero** las dos pantallas clave (catálogo y ficha) en una herramienta de diseño, y
   exportarlas a `web/design/*.html` como **referencia visual**, no como código a copiar.
2. **Traducir los tokens** —paleta, tipografías, escala, espaciado— al CSS del proyecto. El agente
   tiene que traducir, no pegar: un export suele venir con CDN y config inline que no corresponden.
3. **Una skill de diseño en el repo** (`.claude/skills/<nombre>/SKILL.md`) con la identidad, los
   errores ya cometidos y los defaults prohibidos. Como los agentes cargan `.claude/` del proyecto,
   la leen sin que la nombres.
4. **Pedir el plan antes del código**: que escriba paleta, roles tipográficos, concepto de
   composición y cuál va a ser el elemento memorable, y que lo revise contra la skill. Con el plan
   escrito podés rechazar antes de que gaste una corrida entera.

Y hacelo **antes** de construir la segunda pantalla: si la ficha nace con el criterio viejo, vas a
corregir dos pantallas en vez de una.

---

## 11 · Lo que costó aprender

**Cuando el agente frena, revisá tu consigna antes que su criterio.** Nos pasó cuatro veces: pedí
"solo presentación" e incluí funcionalidad nueva; pedí una ruta que la spec había cambiado; pedí
traducciones que una decisión anterior había dejado fuera; enumeré campos que otra decisión excluía.
En las cuatro, el agente comparó contra la spec y preguntó. El error era mío.

**Las decisiones se citan, y por eso se contradicen a la vista.** Una vez el agente encontró que dos
decisiones registradas, juntas, hacían que ninguna ficha rural se anunciara en alemán. Sin
`decisiones.md`, eso se descubre en producción.

**El trabajo técnico sin funcionalidad necesita su propia feature.** Refactors, limpieza de
scaffold, gates: no entran en la spec del catálogo y no tienen id. Creá `specs/mantenimiento/` con
ids propios (`M-01`) desde el principio.

**Un canal caído no habilita a suponer.** Si la pregunta no llega, el agente tiene que registrar el
bloqueo, no seguir con su mejor criterio. Verificalo antes de confiar.

**Lo que el orquestador no reemplaza:** automatiza el traspaso y la exigencia, no la crítica. Los
errores caros no fueron dudas calladas, fueron **certezas falsas**: un nombre de columna inventado
con total seguridad, un test que verifica un camino inexistente. Eso lo detecta alguien leyendo el
reporte con la pregunta "¿esto prueba lo que dice que prueba?".

---

## 12 · Cuándo NO hacer esto

Spec-driven agrega una etapa entera antes del código. Para un cambio de una línea, un texto o un
ajuste de estilo, es burocracia: corré la tarea directo con el agente que corresponda, sin pasar por
spec.

Regla práctica: usalo donde la ambigüedad ya te costó caro —plata, estados, reglas de negocio, o un
modelo de datos que después cuesta migrar— y salteálo en lo mecánico.

---

## 13 · Problemas de la primera vez

| Síntoma | Qué pasa |
|---|---|
| "La raíz del agente no existe" | Falta `npm run init -- -p catalogo` |
| "tiene cambios sin commitear" | El orquestador exige árbol limpio para crear la rama y para que el diff muestre solo lo del agente |
| `Reached maximum number of turns` | `maxTurnos` bajo, o la tarea era demasiado grande. Subilo y partí la tarea |
| Termina sin cerrar nada | Commiteá lo hecho y pedile que cierre, no relances desde cero |
| El contrato rechaza una tarea de infraestructura | Falta `cuando: "si-cambia"` con sus disparadores |
| "Estos ids no existen en tareas.md" | Inventó ids o renumeró la spec. Por eso los ids son estables |
| La respuesta se registra cortada | Pegá en bloques cortos, o usá Telegram. Verificá con `tail decisiones.md` |
| Una respuesta aparece en la pregunta equivocada | Contestaste por dos canales, o escribiste en la terminal del orquestador |
| Pregunta cosas obvias | Falta contexto en su `CLAUDE.md`, o `lecturaExtra` no incluye donde está la respuesta |
| No pregunta nada y decide solo | Revisá `reglasEscalada` y que el log liste `preguntar` |
| Rechaza `dondeBusque` siempre | Las rutas tienen que existir dentro de la raíz del agente o sus `lecturaExtra` |
| El sitio se ve genérico | No hay skill de diseño ni referencia visual: está produciendo el promedio |
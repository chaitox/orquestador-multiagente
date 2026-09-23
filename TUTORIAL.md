# Tutorial — spec-driven con el orquestador, de cero

Vamos a crear un proyecto nuevo —el **catálogo web de propiedades**: casas, departamentos y
campos, en venta y alquiler, con contacto por WhatsApp— usando tres agentes: uno que **especifica**
y dos que **implementan**. Al terminar vas a tener una feature hecha con trazabilidad de la decisión
al código.

Es buen ejemplo porque tiene ambigüedad de verdad: un departamento amoblado, una casa de 4
dormitorios en el centro de la ciudad y un campo de 80 hectáreas con corral y pozo artesano **no se
describen con los mismos campos**. Un agente sin spec elige un modelo y sigue; con spec, pregunta.

Lleva entre 40 y 60 minutos la primera vez, casi todo esperando generadores y leyendo la spec.

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

  // Esto es lo que vuelve real el spec-driven: los ids se validan contra el archivo
  spec: { dir: "specs/{feature}", archivoTareas: "tareas.md", agente: "spec" },

  preguntas: { canal: "consola", timeoutMin: 30, fase0: true },

  agentes: [
    {
      id: "spec",
      descripcion: "Escribe la especificación. NO toca código.",
      raiz: "specs",
      modelo: "opus",               // acá se decide, conviene el mejor modelo
      prompt: "catalogo/spec.md",
      lecturaExtra: ["api", "web"], // lee el código para no especificar contra un sistema imaginario
      plantilla: { tipo: "custom", comandos: ["mkdir -p {nombre}"] },
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
      lecturaExtra: ["specs"],
      plantilla: { tipo: "nestjs" },
      verificacion: ["npm run build", "npm test -- --passWithNoTests"],
      contrato: { requiereCambiosEn: ["docs/{feature}/**"] },
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
| `spec` con `raiz: "specs"` y sin acceso a `api`/`web` | Si pudiera escribir código, "resolvería" la ambigüedad implementando en vez de preguntando: elegiría un modelo de propiedad y seguiría |
| `lecturaExtra: ["api", "web"]` en spec | Para que los nombres de tablas y endpoints salgan del código, no de su cabeza |
| `spec.dir` en el proyecto | Activa la validación de ids al cerrar entregas |
| `contrato` del spec | Sin requisitos y sin tareas, el cierre se rechaza (vale también al usar `tarea_completa`) |
| `agentePrincipal: "spec"` | Toda feature arranca especificando, sin que te lo tengas que acordar |
| `sensibles` con precio y moneda | Son las decisiones que no querés que se resuelvan solas: te piden aprobación |

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
Agencia que publica casas, departamentos y propiedades
rurales, en venta y alquiler; los interesados contactan por WhatsApp.

## Reglas
- Leé el código existente antes de especificar.
- Una tarea sin criterio de aceptación no es una tarea.
- Cuidado con lo que varía entre tipos: una casa tiene dormitorios, un campo tiene hectáreas.
  No fuerces un modelo único sin preguntarlo.
- Precios, monedas y datos de contacto del propietario no se inventan.
- Los ids son estables: no los renumeres después, porque las entregas los citan.
- Todo lo que no puedas resolver leyendo, preguntalo acá: es el momento más barato.
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

Crea `~/dev/catalogo/{specs,api,web}`, inicializa los repos git, crea `docs/` (por el contrato de
`api`) y escribe un `CLAUDE.md` en cada uno.

---

## 4 · Especificar

```bash
npm run tarea -- -p catalogo -f publicaciones \
  "Catálogo público de propiedades: casas, departamentos y campos, en venta o alquiler, \
   con fotos, características y botón de contacto por WhatsApp."
```

El agente lee el código y **antes de escribir la spec** pregunta lo que no puede resolver. Con este
dominio, las preguntas que van a salir son reales, no de ejemplo:

- **Tipos de propiedad y sus campos.** Una casa tiene dormitorios y baños; un departamento amoblado
  suma "equipado"; un campo tiene hectáreas, corral, casa de capataz, pozo artesano y batea. ¿Un
  modelo único con campos opcionales, o tipos separados? Es la decisión de diseño más cara de esta
  feature y no se adivina.
- **Medidas del terreno.** En los avisos aparece como `10 x 50`, como `500 m²` y como `80 hectáreas`.
  ¿Se guarda frente y fondo, superficie, o las dos y se calcula una?
- **Precio.** Varios avisos no lo publican. ¿El precio es opcional, se muestra "consultar", y en qué
  moneda —guaraníes o dólares—? (Esta pregunta va a pedirte aprobación, porque `precio` y `moneda`
  están en `sensibles`.)
- **Ubicación.** "Centro", "a dos cuadras de la ruta principal", "a pocos metros de la
  autopista". ¿Ciudad y barrio como texto libre, lista cerrada, o coordenadas?
- **Estado legal.** "Titulado a transferir", "documentación en regla". ¿Es un campo del sistema o
  texto libre del aviso?
- **Contacto.** Los avisos muestran más de un número. ¿El contacto es uno de la agencia o
  depende de la propiedad?
- **Medios.** Fotos y **video** (recorridos con drone, sobre todo en propiedades rurales). ¿Cuántas
  fotos por propiedad, hay portada, en qué orden se muestran?
- **Dónde viven los videos.** Esta es la pregunta cara: un recorrido con drone pesa más que todas las
  fotos del catálogo juntas. ¿Se suben al servidor, o se publican en YouTube/Vimeo y se guarda el
  enlace? ¿Hay un límite de peso o duración? ¿Se muestra en autoplay o con portada y play?
- **Consumo de datos.** Mucha gente va a abrir la ficha desde el celular con datos móviles. ¿El video
  carga solo cuando lo piden, o apenas entran a la ficha?

**Cómo contestar:** corto y decidido. "Tipos separados: casa, departamento y rural." "El precio es
opcional; si no está, se muestra 'Consultar'." "Moneda: guaraníes y dólares, se guarda cuál."
"Video: enlace de YouTube, no subimos archivos; se muestra con portada y play, no autoplay."
Si no sabés, decilo: *"no sé todavía, dejalo fuera de alcance y anotalo como pendiente"* es una
respuesta válida y evita que invente.

Lo que no hay que contestar nunca es "usá tu criterio": eso desarma el mecanismo entero.

Cada respuesta queda en `~/dev/catalogo/decisiones.md` con su id.

## 5 · Revisar la spec (este paso es tuyo, no se automatiza)

```bash
cat ~/dev/catalogo/specs/publicaciones/requisitos.md
cat ~/dev/catalogo/specs/publicaciones/tareas.md
```

Checklist para rechazar:

- [ ] ¿Hay requisitos que en realidad son implementación? ("usar una tabla `propiedades` con índice
      en `ciudad`" no es un requisito, es diseño)
- [ ] ¿Cada tarea tiene criterio de aceptación verificable? Si dice "que funcione bien", no sirve
- [ ] ¿Hay algo que vos no decidiste y aparece decidido igual? Eso es una invención que se coló
      (típico acá: que el precio sea obligatorio, o que la moneda sea una sola)
- [ ] ¿Las tareas dicen qué agente las hace?
- [ ] ¿Las respuestas que diste están reflejadas en la spec, o solo en `decisiones.md`?

Si algo está mal, corregilo vos a mano y commiteá, o volvé a correr el agente `spec` pidiendo el
cambio puntual. **No arranques a implementar sobre una spec que no leíste**: el resto del flujo va a
ejecutar fielmente lo que diga.

Señal útil: si esta feature generó ocho preguntas, la pedida era ambigua —acá es esperable que
genere varias, y eso está bien: es la etapa donde salen baratas. Si generó cero, o el agente no está
preguntando o la feature no necesitaba spec.

---

## 6 · Implementar

```bash
npm run tarea -- -p catalogo -f publicaciones -a api \
  "Implementá T-01 a T-04 de specs/publicaciones/tareas.md"
```

Al cerrar, el agente cita los ids. Si inventa uno, se rechaza; si no cita ninguno, también.
Y si no actualizó `docs/publicaciones/`, el contrato rechaza el cierre.

Después el front:

```bash
npm run tarea -- -p catalogo -f publicaciones -a web \
  "Implementá T-05 a T-07 usando el contrato de api/docs/publicaciones"
```

Si al `web` le falta algo del backend, usa `solicitar_a("api")` y el orquestador serializa el
traspaso; vos no copiás nada.

---

## 7 · Revisar el resultado

```bash
cd ~/dev/catalogo/api && git log --oneline agente/publicaciones
git diff main...agente/publicaciones

cat ~/dev/catalogo/decisiones.md                   # qué se preguntó y qué contestaste
cat orquestador/.orquestador/catalogo/*.json       # historial, costo, preguntas, verificaciones
```

Las tres preguntas para leer el diff, que ningún mecanismo contesta por vos:

1. ¿El código hace lo que dice la tarea que citó?
   (Dos pruebas concretas acá: cargá un campo de 80 ha y un departamento amoblado —si el modelo
   obliga a poner dormitorios en el campo, la decisión de tipos quedó mal resuelta—; y abrí una
   ficha con video en el celular con datos móviles, a ver si el video carga antes de que alguien lo
   pida.)
2. ¿Los tests prueban lo que dicen probar, o solo pasan?
3. ¿Hay algo que se decidió sin preguntar?

---

## 8 · La segunda feature

Acá se nota el efecto acumulado: el agente `spec` lee `decisiones.md` antes de preguntar, y si la
duda ya fue respondida, el handler se la devuelve citada sin molestarte. Las preguntas de la segunda
feature deberían ser menos y más específicas. Si son las mismas, algo no se está escribiendo donde
corresponde.

---

## 9 · Cuándo NO hacer esto

Spec-driven agrega una etapa entera antes del código. Para un cambio de una línea, un texto o un
ajuste de estilo, es burocracia: corré la tarea directo con el agente que corresponda
(`-a api`), sin pasar por spec.

Regla práctica: usalo donde la ambigüedad ya te costó caro —plata, estados, fiscal, reglas de
negocio, o un modelo de datos que después cuesta migrar como el de esta feature— y salteálo en lo
mecánico. Cambiar el color de un botón del catálogo no necesita spec.

---

## 10 · Problemas de la primera vez

| Síntoma | Qué pasa |
|---|---|
| "La raíz del agente no existe" | Falta `npm run init -- -p catalogo` |
| Pide aprobación al preguntar por precios | Es correcto: `precio` y `moneda` están en `sensibles` |
| El spec cierra sin `tareas.md` | No debería: el contrato se valida también en `tarea_completa`. Si pasa, revisá que `requiereCambiosEn` apunte a rutas relativas a la raíz del agente |
| "Estos ids no existen en tareas.md" | El agente inventó ids, o renumeró la spec. Los ids son estables por eso |
| Pregunta cosas obvias | Falta contexto en su `CLAUDE.md`, o `lecturaExtra` no incluye donde está la respuesta |
| No pregunta nada y decide solo | Revisá que `reglasEscalada` esté en el config y que el agente tenga la herramienta (mirá el log: tiene que listar `preguntar`) |
| Rechaza `dondeBusque` siempre | Las rutas tienen que existir dentro de la raíz del agente o sus `lecturaExtra` |

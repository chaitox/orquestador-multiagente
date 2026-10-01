# Interfaz web del orquestador — manual de implementación

Guía para construir una interfaz web local sobre el orquestador. No es una spec formal: es el plan,
las decisiones ya tomadas y lo que hay que decidir al implementar.

---

## 1. Qué es y qué no es

**Es** una ventana al orquestador: ver qué pasó, qué está pasando, y crear proyectos nuevos sin
escribir el config a mano.

**No es** un coordinador. La decisión de diseño central del orquestador —el coordinador es código,
no un agente— no cambia porque haya una pantalla. La interfaz **muestra y recibe respuestas**; el
orquestador sigue siendo el que manda. Si la interfaz se cae, la corrida sigue.

**Por qué existe**, en orden de valor:

1. La consola es a la vez donde mirás el log y donde contestás. Esa mezcla causó dos bugs reales
   (respuestas registradas en la pregunta equivocada, texto truncado al pegar). Separar las dos
   cosas es la ganancia más grande.
2. Crear un proyecto hoy es escribir a mano un archivo con agentes, rutas, contratos y
   verificaciones. Es la barrera de entrada para cualquiera que no lo haya escrito.
3. El historial de tareas, costos y decisiones existe en JSON y nadie lo mira porque no hay dónde.

---

## 2. Arquitectura

```
navegador (React + Vite)
        │  HTTP / SSE
        ▼
servidor local (Node + TypeScript)
        │  lee y escribe archivos
        ▼
.orquestador/*.json · proyectos/*.ts · prompts/ · <proyecto>/decisiones.md
```

**Dos procesos, no uno.** El servidor web corre aparte del orquestador. No lo lanza, no lo controla:
lee lo que el orquestador escribe.

**El estado ya existe en disco.** El JSON de cada tarea se escribe *durante* la corrida, con
historial, sesiones, costo, preguntas y ramas. La vista de solo lectura no necesita ningún cambio en
el orquestador.

**Stack sugerido**, por coherencia con el repo: TypeScript en los dos lados, servidor con Fastify o
el `http` de Node (poca superficie, pocas dependencias), frontend React + Vite. Si el proyecto suma
más adelante otro motor o más pantallas, ninguna de esas elecciones estorba.

---

## 3. Fases

Cada fase se puede usar sola. No empieces la siguiente sin la anterior funcionando.

### Fase 1 — Solo lectura

La más barata y la que más rinde por hora invertida. No toca el orquestador ni escribe nada.

**Pantallas:**

- **Proyectos**: uno por archivo de `proyectos/`. Nombre, agentes, cuántas tareas corridas, costo
  acumulado.
- **Tareas de un proyecto**: lista desde `.orquestador/<proyecto>/*.json`. Feature, estado
  (`completada`, `detenida`, `aparcada`), costo, cuántas solicitudes entre agentes, fecha.
- **Detalle de una tarea**: el historial en orden — turnos, solicitudes, entregas, verificaciones
  fallidas, preguntas con su respuesta. Es el JSON, presentado.
- **Decisiones**: `decisiones.md` del proyecto, renderizado, con buscador. Es el documento que más
  se consulta y hoy se lee con `cat`.

**Endpoints:**

```
GET /api/proyectos
GET /api/proyectos/:nombre
GET /api/proyectos/:nombre/tareas
GET /api/proyectos/:nombre/tareas/:id
GET /api/proyectos/:nombre/decisiones
```

**Decisión a tomar al implementar:** si el servidor lee los archivos en cada pedido o los cachea.
Para el tamaño real (decenas de JSON de pocos KB) leer en cada pedido alcanza y evita invalidaciones
mal hechas.

### Fase 2 — Seguir una corrida en vivo

**Lo mínimo que funciona sin tocar el orquestador:** consultar el JSON de la tarea en curso cada dos
segundos y redibujar. El orquestador ya lo escribe a medida que avanza.

**Lo que necesita un cambio chico del orquestador:** el log por turno (el texto del agente y sus
llamadas a herramientas) hoy va solo a la consola. Para verlo en la web, que además lo escriba a un
archivo por tarea (`.orquestador/<proyecto>/<tarea>.log`), y que el servidor lo sirva por SSE.

Es un `console.log` duplicado a archivo, no una refactorización.

**Qué mostrar:** un panel por agente, con color, la tarea en curso destacada, y los eventos
importantes visibles sin leer todo — solicitud despachada, aprobación pendiente, verificación
fallida, pregunta abierta.

### Fase 3 — Contestar desde la web

El canal que más te cambia el día a día, y el que más puede romper. No lo hagas antes de tener la
fase 1 estable.

**Cómo encaja:** es un canal más, junto a consola y Telegram. El orquestador ya tiene la interfaz
`Canal` con `preguntar`, `confirmar` y `avisar`; falta una implementación que deje la pregunta en un
archivo o en memoria compartida y espere la respuesta.

**Lo más simple que funciona**, sin inventar un bus de mensajes: el canal web escribe
`.orquestador/<proyecto>/pregunta-pendiente.json` y hace *polling* sobre
`respuesta-<id>.json`; el servidor web lee el primero y escribe el segundo. Feo, pero son dos
procesos en la misma máquina y no hay nada que sincronizar entre redes.

**Lo que no puede perderse en la traducción:**

- Las preguntas se hacen **de a una**: no hay dos pendientes al mismo tiempo.
- Se muestran completos `porQue`, `dondeBusque` y la recomendación. La recomendación **se muestra,
  no se ejecuta sola**.
- Las opciones van como botones; el campo de texto libre sigue disponible, porque corregir la
  opción recomendada es tan válido como elegirla.
- El `timeoutMin` sigue rigiendo: sin respuesta, la tarea se aparca. La web no lo cambia.

### Fase 4 — Stepper de proyecto nuevo

La única pantalla que **escribe** configuración. Genera `proyectos/<nombre>.ts` y los prompts, y
opcionalmente corre `npm run init`.

**Pasos:**

1. **Proyecto**: nombre, carpeta raíz (con selector de carpeta o ruta escrita), modelo por defecto.
2. **Agentes**: uno o varios. Por cada uno: id, descripción, carpeta, stack (que precarga la
   plantilla y los comandos de verificación sugeridos), modelo, y si lee carpetas de otros agentes.
3. **Contratos**: por agente, qué tiene que cambiar para poder cerrar, con la opción de condicional
   y sus disparadores. Acá conviene explicar en pantalla la regla que costó aprender: *un contrato
   que a veces no corresponde enseña a fabricar el cambio*.
4. **Spec-driven** (opcional): si se activa, se crea el agente de spec con su contrato y la carpeta
   de specs.
5. **Preguntas y recursos**: canal, tiempos, y recursos externos compartidos.
6. **Revisión**: se muestra el archivo `.ts` generado, editable, antes de guardarlo.

**El paso 6 no es opcional.** Que la persona vea el config que va a quedar es lo que hace que la
interfaz enseñe en vez de esconder. Quien lo use dos veces va a poder escribirlo a mano la tercera.

**Después de guardar**, ofrecer correr `npm run init` y mostrar su salida.

---

## 4. Documentos como insumo

El stepper puede recibir documentos (Word, Excel, PDF) para proyectos que ya tienen un relevamiento
escrito.

**Qué hacer con ellos:** convertirlos a Markdown y dejarlos en `<raiz>/insumos/`, declarando esa
carpeta como `lecturaExtra` del agente de spec.

**Conversión, por formato:**

- **Word (.docx)**: sale bastante limpio con `mammoth`. Es el caso fácil.
- **Excel (.xlsx)**: `SheetJS` a tablas Markdown, una por hoja. Es el más delicado: celdas
  combinadas, hojas ocultas y columnas de cálculo no se traducen bien. Conviene mostrar el resultado
  y dejar editarlo antes de guardar.
- **PDF**: si tiene capa de texto, `pdf-parse` alcanza. **Si es escaneado, no hay nada que leer** y
  hay que decirlo claramente en vez de guardar un archivo vacío.

**La regla que no se negocia, y que va escrita en la pantalla:** *el documento es insumo, no spec*.
Es material en bruto, sin decisiones tomadas ni criterios de aceptación. El agente lo lee y lo
convierte; no lo copia.

**Lo que NO hay que hacer:** exigir un documento para avanzar. Muchos proyectos no lo tienen —la
etapa de preguntas existe justamente para eso— y un paso obligatorio hace que la gente suba
cualquier cosa para pasarlo. Es el mismo patrón del requisito que se puede satisfacer de mentira.

---

## 5. Seguridad

Corre en la máquina de quien desarrolla, pero lee y escribe archivos reales.

- **Escuchar solo en `127.0.0.1`**, nunca en `0.0.0.0`. Sin esto, cualquiera en la red de la oficina
  o del café lee los proyectos y crea configs.
- **Validar toda ruta** que llegue del navegador: que caiga dentro de las carpetas conocidas. Un
  `../../` en el nombre de un proyecto no puede terminar leyendo `~/.ssh`.
- **No exponer el `.env`** ni ningún valor de configuración con credenciales. La pantalla de
  proyectos muestra nombres de variables, nunca valores.
- **Solo lectura por defecto.** Escribir configs es una acción explícita del stepper, con
  confirmación.

---

## 6. Diseño

Vale lo mismo que aprendimos en el catálogo: sin dirección, sale una pantalla genérica.

- Escribí un `design-system.md` y una skill en el repo antes de la primera pantalla.
- **El contenido manda**: acá el protagonista es el log y el detalle de una tarea. Todo lo demás se
  queda callado alrededor.
- Es una herramienta de trabajo: densidad de información alta, sin animaciones de entrada, sin
  tarjetas idénticas con sombra para todo.
- Modo oscuro desde el principio: se va a usar al lado de una terminal.

---

## 7. Cómo construirlo con el propio orquestador

Es el mejor caso de prueba que tenés: una herramienta construyéndose con sus propias reglas.

```ts
// proyectos/orquestador-web.ts
agentes: [
  { id: "spec",     raiz: "specs",    modelo: "opus" },
  { id: "servidor", raiz: "servidor", plantilla: { tipo: "node-ts" },
    contrato: { requiereCambiosEn: ["docs/{feature}/**"] } },
  { id: "web",      raiz: "web",      plantilla: { tipo: "react-vite" },
    lecturaExtra: ["servidor/docs"] },
]
```

Y una feature por fase: `lectura`, `vivo`, `respuestas`, `stepper`.

**Un detalle a tener presente:** el agente que trabaje sobre el servidor va a leer y escribir
archivos de `.orquestador/` mientras el orquestador los usa. Declarar ese directorio como `recurso`
compartido evita que una corrida pise a la otra.

---

## 8. Qué NO construir

- **Lanzar tareas desde la web.** Suena natural y es donde empieza a convertirse en un producto. Una
  tarea se lanza desde la terminal, donde se ve lo que pasa. Si algún día se agrega, que sea después
  de que todo lo demás esté estable.
- **Editar specs o decisiones desde la web.** Son archivos versionados: se editan donde se edita el
  código, con su commit.
- **Un tablero de estado de PRs y CI.** Eso ya existe y está mejor hecho en otras herramientas.

---

## 9. Orden sugerido

1. Fase 1 completa, usada durante una semana real. Si no la abrís, el resto no vale la pena.
2. Fase 2, que es la que reemplaza mirar la terminal.
3. Fase 4 (stepper), que es la que baja la barrera de entrada para otros.
4. Fase 3 (contestar), última: es la más útil y la que más puede romper.
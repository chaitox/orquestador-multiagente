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
Con el disco real, `ejemplo-pedidos` y `ejemplo-spec` apuntan a `~/dev/pedidos` y `~/dev/demo`,
que no existen.

**Decidido:** se carga con `exigirRaices: false`, y aun así cada proyecto se carga dentro de su
propio `try`. Un proyecto que explota al cargar aparece en la lista con su error como dato, y
los demás cargan normal. Si la raíz resuelta no existe, se marca (`raizExiste: false`) en vez
de fallar — es el dato útil que pidió **DEC-lectura-02**.

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

### D-7 · La web no sabe en qué puerto está el servidor

**Decidido:** la web pide siempre a `/api/...` relativo, y Vite redirige `/api` al servidor en
desarrollo. El puerto lo elige el servidor y lo documenta en `servidor/docs/lectura/`; la web
lo lee de ahí para configurar el proxy (tiene `servidor/docs` en su `lecturaExtra`).

**Descartado:** una `VITE_API_URL` en la web. Agrega un `.env` más para mantener sincronizado
y el manual ya pide no multiplicar configuración.

### D-8 · Decisiones: markdown completo más un índice tolerante

El `decisiones.md` que genera `src/decisiones.ts:21` tiene un formato fijo
(`## <id> — <fecha>`, `**Pregunta** (<agente>, tarea <t>): …`, `**Respuesta:** …`), pero los
archivos reales se editan a mano: el de `inmobiliaria` tiene encabezados como
`## DEC-publicacione-1 (tipos) — 2026-09-17`, que no matchean.

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

### D-10 · El esquema del estado se lee como parcial

Los JSON en disco vienen de versiones distintas: los de septiembre no tienen
`reposParticipantes`. **Decidido:** el servidor tipa lo que lee como
`Partial<EstadoTarea>` y completa con valores neutros (`0`, `{}`, `[]`) antes de responder, así
la web recibe siempre la misma forma y no tiene condicionales por versión. Un archivo que ni
siquiera es JSON válido se reporta como una entrada en error dentro de la lista, sin tumbar
las otras 40.

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
  string antes de responder, o no se expone.

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

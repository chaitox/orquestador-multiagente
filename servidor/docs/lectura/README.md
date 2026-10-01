# Servidor de lectura — I-01, I-02, I-03 e I-14

Cubre `I-01` (servidor HTTP + resolución de rutas por lista blanca), `I-02` (inventario de
proyectos), `I-03` (detalle de un proyecto) e `I-14` (fixtures de los casos que no están en
disco). El resto del contrato (`I-04` a `I-07`) todavía no está implementado — llega en
entregas siguientes del mismo agente.

## Cómo arrancar (D-7)

```
cd servidor
npm install   # primera vez
npm start
```

Escucha **solo en `127.0.0.1:4710`**, nunca en `0.0.0.0` (R-08). Probado a mano: pegarle a
la IP de red de la máquina (`192.168.x.x:4710`) da conexión rechazada; `127.0.0.1:4710` sí
responde.

La web (`I-08`, D-7) lee el puerto de acá para configurar su proxy de Vite: **4710**.

## Rutas que existen hoy

### `GET /api/proyectos` (I-02)

Unión de `proyectos/*.ts` y `.orquestador/<nombre>/` (D-1), con el agregado por proyecto que
pide `I-02`: cantidad de tareas, costo acumulado (redondeado a 4 decimales), fecha de la
tarea más reciente e ids de agentes (solo si hay config). Además las marcas de D-3:
`raizExiste` (si la raíz del config resuelve a una carpeta que existe; `null` si no hay
config que resolver) y `errorConfig` (el mensaje si cargar el config tiró; el proyecto
sigue en la lista igual — un proyecto no puede tumbar a los demás).

Ejecutado contra el disco real de este repo, sin fixtures montados:

```json
[
  {
    "nombre": "ejemplo-pedidos",
    "tieneConfig": true,
    "tieneEstado": false,
    "raizExiste": false,
    "errorConfig": null,
    "agentes": ["app", "api", "portal"],
    "cantidadTareas": 0,
    "costoAcumuladoUsd": 0,
    "ultimaTareaFecha": null
  },
  {
    "nombre": "ejemplo-python-react",
    "tieneConfig": true,
    "tieneEstado": false,
    "raizExiste": false,
    "errorConfig": null,
    "agentes": ["web", "api"],
    "cantidadTareas": 0,
    "costoAcumuladoUsd": 0,
    "ultimaTareaFecha": null
  },
  {
    "nombre": "ejemplo-spec",
    "tieneConfig": true,
    "tieneEstado": false,
    "raizExiste": false,
    "errorConfig": null,
    "agentes": ["spec", "api", "web"],
    "cantidadTareas": 0,
    "costoAcumuladoUsd": 0,
    "ultimaTareaFecha": null
  },
  {
    "nombre": "inmobiliaria",
    "tieneConfig": false,
    "tieneEstado": true,
    "raizExiste": null,
    "errorConfig": null,
    "agentes": null,
    "cantidadTareas": 41,
    "costoAcumuladoUsd": 100.7706,
    "ultimaTareaFecha": "2026-09-23T16:34:01.847Z"
  },
  {
    "nombre": "interfaz",
    "tieneConfig": true,
    "tieneEstado": true,
    "raizExiste": true,
    "errorConfig": null,
    "agentes": ["spec", "servidor", "web"],
    "cantidadTareas": 5,
    "costoAcumuladoUsd": 11.8448,
    "ultimaTareaFecha": "2026-10-01T14:19:48.713Z"
  },
  {
    "nombre": "prueba",
    "tieneConfig": true,
    "tieneEstado": true,
    "raizExiste": true,
    "errorConfig": null,
    "agentes": ["a", "b"],
    "cantidadTareas": 5,
    "costoAcumuladoUsd": 0.4935,
    "ultimaTareaFecha": "2026-10-01T11:26:52.331Z"
  }
]
```

Da exactamente estos seis proyectos, igual que pide el criterio de `I-02`. `inmobiliaria`
(sin `proyectos/inmobiliaria.ts`) suma `100.7706` de sus 41 archivos — verificado igual al
número del criterio. `cantidadTareas` de `interfaz` y `prueba` sube con cada corrida
(incluida la que generó este ejemplo): no es un número fijo, a diferencia del de
`inmobiliaria` (ver `I-02` en `specs/lectura/tareas.md`).

Con un fixture de JSON inválido montado (`npm run fixtures:montar`, ver más abajo), ese
proyecto sigue en la lista (`cantidadTareas` lo cuenta, `costoAcumuladoUsd` no suma su costo
porque no se pudo leer) y el endpoint sigue respondiendo `200`.

### `GET /api/proyectos/:nombre` (I-03)

Config resuelta del proyecto (misma resolución que usa el orquestador real,
`cargarProyecto()` de `src/config.ts`, con `exigirRaices: false` — D-3) más las marcas de
config/raíz faltante. `:nombre` se busca con el mismo helper de lista blanca de D-5 que usa
`GET /api/proyectos`.

**`GET /api/proyectos/interfaz`** — sus tres agentes con carpeta, modelo resuelto, lecturas
extra, verificaciones, recursos y contrato, y los topes del proyecto (`maxTurnos: 150`,
`specDriven: true` en `specs/{feature}`):

```json
{
  "nombre": "interfaz",
  "tieneConfig": true,
  "errorConfig": null,
  "config": {
    "raiz": "/ruta/al/repo",
    "raizExiste": true,
    "modeloPorDefecto": "claude-sonnet-5",
    "maxSolicitudes": 6,
    "maxTurnos": 150,
    "maxIntentosVerificacion": 2,
    "git": {
      "estrategia": "rama-por-tarea",
      "prefijoRama": "agente/",
      "commitAlCerrar": true,
      "exigirLimpio": true
    },
    "preguntas": {
      "canal": "consola",
      "timeoutMin": 45,
      "maxPorTarea": 10,
      "avisarFin": true,
      "fase0": true
    },
    "specDriven": true,
    "spec": { "dir": "specs/{feature}", "archivoTareas": "tareas.md", "agente": "spec" },
    "agentes": [
      {
        "id": "spec",
        "descripcion": "Escribe la especificación de la interfaz. No toca código.",
        "carpeta": "/ruta/al/repo/specs",
        "repo": "/ruta/al/repo/specs",
        "modelo": "claude-opus-5",
        "lecturaExtra": ["/ruta/al/repo/src", "/ruta/al/repo/servidor", "/ruta/al/repo/web", "/ruta/al/repo/MANUAL-WEB.md"],
        "verificacion": [],
        "recursos": [],
        "contrato": { "requiereCambiosEn": ["{feature}/requisitos.md", "{feature}/tareas.md"] }
      },
      {
        "id": "servidor",
        "descripcion": "API local de solo lectura sobre .orquestador/, proyectos/ y decisiones.md. Dueño del contrato.",
        "carpeta": "/ruta/al/repo/servidor",
        "repo": "/ruta/al/repo/servidor",
        "modelo": "claude-sonnet-5",
        "lecturaExtra": ["/ruta/al/repo/specs", "/ruta/al/repo/src"],
        "verificacion": [{ "comando": "npx tsc --noEmit", "reintentar": true }],
        "recursos": ["estado-orquestador"],
        "contrato": { "requiereCambiosEn": ["docs/{feature}/**"] }
      },
      {
        "id": "web",
        "descripcion": "Interfaz en React + Vite. Consume la API del servidor.",
        "carpeta": "/ruta/al/repo/web",
        "repo": "/ruta/al/repo/web",
        "modelo": "claude-sonnet-5",
        "lecturaExtra": ["/ruta/al/repo/specs", "/ruta/al/repo/servidor/docs"],
        "verificacion": [{ "comando": "npm run build", "reintentar": true }],
        "recursos": [],
        "contrato": null
      }
    ]
  }
}
```

(Acá `/ruta/al/repo` reemplaza la ruta absoluta real de la máquina donde se corrió el
ejemplo, por legibilidad — la respuesta real trae la ruta absoluta tal cual, no hay nada
oculto.)

**`GET /api/proyectos/inmobiliaria`** — sin config: `200`, no `404` (R-05, D-1):

```json
{ "nombre": "inmobiliaria", "tieneConfig": false, "errorConfig": null, "config": null }
```

**`GET /api/proyectos/ejemplo-pedidos`** — con config y raíz inexistente (`~/dev/pedidos`,
expandida por `expandir()` de `src/config.ts`, no `~/dev/pedidos` literal): `200` con la
marca `raizExiste: false`, y es JSON válido aunque el config tenga `sensibles` con `RegExp`
(`[/precio/i, /pago/i, /factura/i]`, línea 17 del archivo) — ese campo no se expone en la
respuesta (ver "RegExp" más abajo):

```json
{
  "nombre": "ejemplo-pedidos",
  "tieneConfig": true,
  "errorConfig": null,
  "config": {
    "raiz": "/Users/<usuario>/dev/pedidos",
    "raizExiste": false,
    "modeloPorDefecto": "claude-sonnet-5",
    "maxSolicitudes": 6,
    "maxTurnos": 200,
    "maxIntentosVerificacion": 2,
    "git": { "estrategia": "rama-por-tarea", "prefijoRama": "agente/", "commitAlCerrar": true, "exigirLimpio": true },
    "preguntas": { "canal": "consola", "timeoutMin": 30, "maxPorTarea": 10, "avisarFin": true, "fase0": true },
    "specDriven": false,
    "spec": null,
    "agentes": [
      { "id": "app", "descripcion": "App interna en Flutter Web (carga de pedidos, preparación, caja)", "carpeta": "/Users/<usuario>/dev/pedidos/pedidos-app", "repo": "/Users/<usuario>/dev/pedidos/pedidos-app", "modelo": "claude-sonnet-5", "lecturaExtra": ["/Users/<usuario>/dev/pedidos/pedidos-api/docs"], "verificacion": [{ "comando": "flutter analyze", "reintentar": true }, { "comando": "flutter test", "reintentar": true }], "recursos": [], "contrato": null },
      { "id": "api", "descripcion": "Backend NestJS + Prisma + PostgreSQL", "carpeta": "/Users/<usuario>/dev/pedidos/pedidos-api", "repo": "/Users/<usuario>/dev/pedidos/pedidos-api", "modelo": "claude-opus-5", "lecturaExtra": [], "verificacion": [{ "comando": "npm run build", "reintentar": true }, { "comando": "npm test -- --passWithNoTests", "reintentar": true }], "recursos": [], "contrato": { "requiereCambiosEn": ["docs/{feature}/**"], "mensajeRechazo": "Rechazado: no actualizaste docs/{feature}/. Esos docs son el contrato que consume el front; la tarea no está terminada sin ellos." } },
      { "id": "portal", "descripcion": "Portal web del cliente en Next.js (pedidos online)", "carpeta": "/Users/<usuario>/dev/pedidos/pedidos-portal", "repo": "/Users/<usuario>/dev/pedidos/pedidos-portal", "modelo": "claude-haiku-4-5-20251001", "lecturaExtra": ["/Users/<usuario>/dev/pedidos/pedidos-api/docs"], "verificacion": [{ "comando": "npm run lint", "reintentar": true }, { "comando": "npm run build", "reintentar": true }], "recursos": [], "contrato": null }
    ]
  }
}
```

`GET /api/proyectos/ejemplo-python-react` es el mismo caso para `bashProhibido`
(`[/alembic\s+downgrade/]`, línea 49): también `200`, también sin exponer ese campo.

- `:nombre` fuera del inventario (`GET /api/proyectos/noexiste`) → `404`
  `{"error":"No se encontró el proyecto \"noexiste\""}`.
- `:nombre` con un intento de recorrido (`GET /api/proyectos/..%2F..%2Fetc`) → `404`, sin
  tocar el filesystem fuera de `proyectos/` y `.orquestador/`.

#### Campos que no están

- **`sensibles` (proyecto) y `bashProhibido` (agente)**: son los dos únicos campos del config
  tipados como `RegExp[]`. La regla transversal del diseño (`diseño.md` §"Contrato HTTP") da
  dos opciones para que no rompan el `JSON.stringify`: serializarlos como string, o no
  exponerlos. Acá se eligió no exponerlos — no los pide la lista de R-02 y evitar el campo es
  más simple que mantener una serialización de `RegExp` sincronizada. `ejemplo-pedidos` (con
  `sensibles`) y `ejemplo-python-react` (con `bashProhibido`) son los dos únicos proyectos del
  repo con alguno de los dos campos, y sus respuestas de arriba muestran que el resto de la
  config se sirve igual, sin que el `RegExp` tumbe la respuesta.
- **Variables de entorno**: el servidor nunca lee `process.env` para construir una respuesta
  (D-6). El único lugar donde una variable podría colarse es una `raiz` con `${VAR}` en el
  config — `expandir()` de `src/config.ts` la sustituye al resolver, antes de que el servidor
  la vea; lo que llega es la ruta ya expandida (un dato útil, una ruta de carpeta), nunca el
  valor crudo de la variable ni el contenido de `.env`.

#### Por qué `cwd` importa para I-03

`resolver()` (`src/config.ts:78`) resuelve una `raiz` relativa (ej. `raiz: "."` en
`proyectos/interfaz.ts`) con `path.resolve()` contra `process.cwd()` **en el momento en que
corre**, no contra la constante `RAIZ_APP` que ese módulo calculó al importarse. Este
servidor arranca con `npm start` dentro de `servidor/`, así que `src/index.ts` hace
`process.chdir()` a la raíz del repo **una sola vez, al arrancar, antes de levantar el
servidor** — ver el comentario ahí. Sin eso, `raiz: "."` se resolvía a `servidor/` en vez de
a la raíz del repo (bug encontrado y corregido durante esta entrega, verificado con el
`curl` de `interfaz` de arriba).

### Cualquier otra ruta

`404` con `{"error": "No se encontró la ruta <ruta>"}`.

### Cualquier método que no sea `GET`

`405` con `{"error": "Método no permitido: ..."}" y header `Allow: GET`, sin importar la
ruta (probado con `POST /api/proyectos`, `PUT /api/proyectos/interfaz` y
`DELETE /api/proyectos`: los tres dan `405`).

## El helper de lista blanca (D-5)

`src/rutas.ts` exporta dos funciones, ninguna sanea strings: comparan contra nombres que ya
existen.

- `resolverNombreProyecto(nombres, crudo)`: decodifica `crudo` (si el `%`-encoding es
  inválido, devuelve `null` sin lanzar) y lo busca en el inventario **ya calculado**
  (`Set` o array de nombres). Si no está, `null` — nunca toca el filesystem con ese string.
- `resolverArchivoTarea(carpetaProyecto, crudo)`: para cuando exista una ruta `:id` dentro
  de un proyecto (la usará `I-05`). Decodifica `crudo`, arma `<id>.json` y lo busca en el
  `readdir` real de `carpetaProyecto` — si `<id>.json` no está en esa lista, `null`. Como
  defensa en profundidad adicional, también resuelve la ruta absoluta y confirma que siga
  cayendo dentro de `carpetaProyecto` antes de devolverla.

El endpoint `GET /api/proyectos/:nombre` usa `resolverNombreProyecto`; es la prueba
end-to-end de que `..%2F..%2Fetc` da `404` sin leer nada fuera de las carpetas conocidas.

## Por qué el puerto y las rutas de datos no salen de `process.cwd()`

`src/config.ts` calcula `DIR_PROYECTOS`/`DIR_ESTADO` a partir de `process.cwd()`, pensado
para un proceso que arranca desde la raíz del repo (`tsx src/index.ts` ahí mismo). Este
servidor arranca con `npm start` **dentro de `servidor/`**, así que reusar esas constantes
tal cual apuntaría `servidor/proyectos` y `servidor/.orquestador` — carpetas que no existen.
`src/raices.ts` calcula las mismas rutas a partir de la ubicación del propio archivo
(`import.meta.url`), independiente del directorio desde el que se lance el proceso.

---

# Fixtures (I-14)

Los casos que el disco real de este repo **no tiene**: verificado sobre los JSON que había
en `.orquestador/` al escribir la spec, ninguno está `aparcada`, ninguno tiene `pendiente`,
ninguno tiene `historial: []` y ninguno es JSON inválido (D-11). Los usan los criterios de
`I-02`, `I-04`, `I-05`, `I-06` y, del lado de la web, `I-10` e `I-11`.

**Ningún fixture modifica, renombra ni borra un archivo existente de `.orquestador/`.**

## Comandos

```
cd servidor
npm run fixtures:montar   # crea las 4 carpetas .orquestador/fixture-<caso>/
npm run fixtures:borrar   # las borra; GET /api/proyectos vuelve a dar los 6 de siempre
```

Verificado a mano: con los fixtures montados, `GET /api/proyectos` da 10 proyectos (los 6
reales + `fixture-aparcada`, `fixture-evento-desconocido`, `fixture-historial-vacio`,
`fixture-json-invalido`); después de `fixtures:borrar`, vuelve a dar exactamente los 6 de
`I-02`.

## Qué caso cubre cada fixture

| Fixture | Carpeta / archivo | Caso | Lo usa |
| --- | --- | --- | --- |
| Tarea aparcada con pendiente completo | `.orquestador/fixture-aparcada/aparcada-2026-01-05T00-00-00-000Z.json` | `estado: "aparcada"`, `pendiente.pregunta` con `porQue`, `dondeBusque`, `opciones` y `recomendacion` anidados bajo `pregunta` (no al tope de `pendiente`, D-10), más `pendiente.trabajo` con la forma de `src/buzon.ts:77` (`Trabajo`, `tipo: "solicitud"` con su `Solicitud` según `src/buzon.ts:6`) | `I-05` (criterio del `pendiente`), `I-10`/`I-11` del lado de la web |
| Historial vacío | `.orquestador/fixture-historial-vacio/historial-vacio-2026-01-05T00-00-00-000Z.json` | `historial: []`; la tarea tiene que fecharse por el `mtime` del archivo, no por `historial[0].fecha` (D-4) | `I-04` |
| JSON inválido | `.orquestador/fixture-json-invalido/json-invalido-2026-01-05T00-00-00-000Z.json` | Archivo cortado a la mitad (no parsea como JSON); la lista de tareas tiene que mostrarlo como entrada en error sin tumbar las demás (D-10) | `I-02` (el proyecto sigue listado, `GET /api/proyectos` sigue en `200`), `I-04` |
| Evento de nombre inventado | `.orquestador/fixture-evento-desconocido/evento-desconocido-2026-01-05T00-00-00-000Z.json` | Historial con `inicio`, `migracion_de_esquema` (no está en la lista cerrada de D-9) y `completada`; el evento desconocido tiene que mostrarse genérico (fecha, nombre, detalle en crudo) sin romper la vista | `I-05` (lee el historial completo), `I-11` del lado de la web |

Cada fixture de tarea está escrito y tipado contra `EstadoTarea` (`src/buzon.ts`) —
importado solo como `import type`, así que no arrastra ningún efecto de borde de
`src/config.ts` (el `process.loadEnvFile()` de ese módulo, en particular) al generar los
fixtures. El de JSON inválido es la única excepción: es texto plano a propósito.

## Fixture de markdown fuera de formato (para `I-06` y `I-12`)

**El caso de `decisiones.md` es distinto a los de arriba**: una carpeta en `.orquestador/`
no alcanza para servir un `decisiones.md`, porque la raíz sale de un config con
`proyectos/*.ts`, y crear uno cae fuera de esta carpeta (D-11). Por eso esta parte se
resuelve como función pura, no como fixture de disco: `servidor/fixtures/decisiones-fuera-de-formato.md`
más `src/decisiones.ts` (`parsearDecisiones`), con el parseo tolerante de D-8 (toda sección
`## ` es una entrada; su id es el primer token del encabezado; los campos que matcheen el
formato de `src/decisiones.ts` se extraen, los que no, quedan en `null`; el markdown crudo
se devuelve siempre completo).

No hace falta montar ni borrar nada para este caso: es una función sobre un archivo que ya
vive en el repo. `I-06` reutiliza `parsearDecisiones()` para el cableado real del endpoint.

**Fixture** (`servidor/fixtures/decisiones-fuera-de-formato.md`): tres secciones a mano,
cada una rota de una forma distinta — con fecha en el encabezado pero sin bloque de
pregunta/respuesta, sin fecha pero con el bloque completo, y sin el prefijo `DEC-` en el id.

**Respuesta de ejemplo**, corriendo `parsearDecisiones()` sobre ese archivo tal cual (es la
que necesita `I-12` para poder verificarse sin un proyecto real que la produzca):

```json
{
  "entradas": [
    {
      "id": "DEC-publicacione-1",
      "encabezado": "DEC-publicacione-1 (tipos) — 2026-09-17",
      "fecha": "2026-09-17",
      "agente": null,
      "tarea": null,
      "pregunta": null,
      "respuesta": null
    },
    {
      "id": "DEC-publicacione-2",
      "encabezado": "DEC-publicacione-2",
      "fecha": null,
      "agente": "web",
      "tarea": "publicaciones-2026-09-18T00-00-00-000Z",
      "pregunta": "¿Tailwind o CSS modules para los componentes nuevos?",
      "respuesta": "Tailwind, ya está instalado en el proyecto y es lo que usa el resto de la\nweb."
    },
    {
      "id": "nota",
      "encabezado": "nota suelta sin prefijo DEC — sigue siendo una entrada",
      "fecha": null,
      "agente": null,
      "tarea": null,
      "pregunta": null,
      "respuesta": null
    }
  ]
}
```

(`markdown` no se repite acá por tamaño: es el contenido íntegro del archivo, los 1248
caracteres exactos — verificado que `resultado.markdown.length === archivo.length`, nunca
se pierde un párrafo aunque el índice no logre extraer todos los campos de una entrada.)

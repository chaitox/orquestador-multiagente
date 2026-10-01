# Servidor de lectura — I-01 e I-14

Cubre `I-01` (servidor HTTP + resolución de rutas por lista blanca) e `I-14` (fixtures de
los casos que no están en disco). El resto del contrato (`I-02` a `I-07`) todavía no está
implementado — llega en entregas siguientes del mismo agente.

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

Son un adelanto mínimo para poder probar el servidor y el helper de lista blanca de I-01,
**no** el contrato final de `I-02`/`I-03` (que todavía no agregan cantidad de tareas, costo
acumulado, fecha de última tarea ni agentes — eso es la próxima entrega). El formato de
estas dos respuestas puede cambiar cuando se implementen esas tareas.

### `GET /api/proyectos`

Unión de `proyectos/*.ts` y `.orquestador/<nombre>/` (D-1), sin fixtures montados:

```json
[
  { "nombre": "ejemplo-pedidos", "tieneConfig": true, "tieneEstado": false },
  { "nombre": "ejemplo-python-react", "tieneConfig": true, "tieneEstado": false },
  { "nombre": "ejemplo-spec", "tieneConfig": true, "tieneEstado": false },
  { "nombre": "inmobiliaria", "tieneConfig": false, "tieneEstado": true },
  { "nombre": "interfaz", "tieneConfig": true, "tieneEstado": true },
  { "nombre": "prueba", "tieneConfig": true, "tieneEstado": true }
]
```

Ejecutado contra el disco real de este repo (sin fixtures): da exactamente estos seis
proyectos, igual que pide el criterio de `I-02`.

### `GET /api/proyectos/:nombre`

Mismo objeto que la fila de arriba, buscado por `:nombre` a través del helper de lista
blanca de D-5 (abajo). Ejemplo, `GET /api/proyectos/interfaz`:

```json
{ "nombre": "interfaz", "tieneConfig": true, "tieneEstado": true }
```

- `:nombre` fuera del inventario (`GET /api/proyectos/noexiste`) → `404`
  `{"error":"No se encontró el proyecto \"noexiste\""}`.
- `:nombre` con un intento de recorrido (`GET /api/proyectos/..%2F..%2Fetc`) → `404`, sin
  tocar el filesystem fuera de `proyectos/` y `.orquestador/`.

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
| JSON inválido | `.orquestador/fixture-json-invalido/json-invalido-2026-01-05T00-00-00-000Z.json` | Archivo cortado a la mitad (no parsea como JSON); la lista de tareas tiene que mostrarlo como entrada en error sin tumbar las demás (D-10) | `I-04` |
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

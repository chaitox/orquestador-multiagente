# Controles positivos

Lo que se midió, con qué, y lo que todavía no.

## 1 · `dondeBusque` rechaza rutas inventadas — ✅ medido (2026-09-17)

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
proyecto. Lo que NO prueba: que el agente haya **leído** el archivo, solo que existe. Cerrar esa
brecha requiere el historial de la sesión; ver "pendiente" abajo.

Match en `decisiones.md`, mismo control:

```
MATCH DEC-abc-1 (1.00) → "Después del IVA, sobre el subtotal ya gravado."
SIN MATCH → va a Telegram: "¿cómo se numeran los comprobantes de nota de crédito?"
```

## 2 · Dos corridas con el mismo recurso — ✅ medido, y encontró un bug

Dos procesos declarando `postgres-local`, el primero reteniéndolo 4 segundos.

**Primera corrida (código original):**
```
A: ADQUIRIDO a los 9ms
B: FALLA a los 0ms — El recurso "postgres-local" está tomado por ctrl/A (pid 111)
```
El lock **sí** era un archivo entre procesos (`~/.orquestador-locks/`), no memoria: B lo vio. Pero
fallaba en vez de esperar, contra lo que decía el manual ("ningún otro arranca").

**Después del arreglo (poll cada 2 s hasta `recursosEsperaMin`):**
```
A: ADQUIRIDO a los 0ms
   ⏳ esperando "postgres-local", tomado por ctrl/A (pid 133)
A: liberado
B: ADQUIRIDO a los 4007ms
```

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

## 4 · Ids de tarea de la spec — ✅ medido (2026-09-17)

`validarIdsTarea` contra un `tareas.md` con T-01, T-02 y T-03:

```
ACEPTA   ["T-01","T-03"]
RECHAZA  ["T-01","T-99"] → inexistentes: T-99
RECHAZA  ["T-07"]        → inexistentes: T-07
RECHAZA  []              (entrega sin citar ninguna tarea)
```

Lo que NO prueba: que la tarea citada sea la que se implementó. Eso sigue siendo lectura humana del
reporte.

## Pendientes conocidos

- **`dondeBusque` no prueba lectura, solo existencia.** Si el SDK expone el historial de la sesión,
  cruzar las entradas contra las llamadas a `Read`/`Grep` de ese agente cierra el hueco.
- **El match de `decisiones.md` es por palabras.** Atrapa las repetidas literales; no atrapa la misma
  pregunta con otro vocabulario.
- **No hay planificador de tareas.** Una tarea aparcada no libera el turno para otra tarea: el
  orquestador corre una por invocación.

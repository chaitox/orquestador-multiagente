# Orquestador multi-agente (Claude Agent SDK)

Varios agentes —uno por cada parte de un sistema— que se piden trabajo entre sí, con contratos
verificables, preguntas que frenan antes de inventar, y commits en una rama aparte.

**El coordinador no es un agente: es código.** Una cola, reglas y validadores. Los agentes deciden;
el orquestador hace cumplir. Un modelo coordinando a otros olvida estado, da por hecha una tarea que
no lo está, o resuelve él lo que debería delegar.

Es un harness, y no compite con los grandes en velocidad ni en paralelismo. La diferencia es el
foco: en vez de que los agentes hagan más, está pensado para que **no inventen lo que no está
escrito**.

```bash
npm install
npm run listar
npm run init  -- -p pedidos                    # crea las carpetas que falten (flutter/nest/next/python...)
npm run tarea -- -p pedidos -f pedidos "Integrar la pantalla de pedidos"
```

Para usarlo en un proyecto nuevo se crea **un archivo de config** en `proyectos/` y los prompts
de cada agente en `prompts/`. No se toca `src/`.

## Por qué existe

Trabajando solo con varios proyectos, terminé haciendo siempre lo mismo: abrir una terminal por
repo, pasar a mano lo que uno necesitaba del otro, y frenar al agente cada vez que estaba por
decidir algo que no le tocaba. Esto es esa forma de trabajar, sacada de mi cabeza y puesta en
código: el traspaso entre repos, la regla de que nada se cierra sin actualizar el contrato, y la
costumbre de preguntar antes de inventar un nombre de columna.

No nació como una herramienta para publicar. Nació porque hacer de cable entre dos terminales es un
trabajo que una persona no debería estar haciendo.

## Qué hace distinto

- **Contratos que rechazan el cierre.** Un agente no puede marcar una entrega como lista si no
  actualizó lo que se le exige (el contrato de API, la documentación). Y el contrato puede ser
  condicional, para no forzar cambios donde no corresponden.
- **Preguntas bloqueantes con evidencia.** Ante lo que no está definido, el agente frena y pregunta
  —por consola o Telegram— y la tarea espera. Para preguntar tiene que citar dónde buscó, y esas
  rutas **se validan contra el repo**: un campo de texto libre se satisface de mentira en dos
  segundos, una ruta inexistente no.
- **Registro de decisiones.** Cada respuesta queda escrita con su id y se le devuelve al agente
  citada. El siguiente agente la consulta antes de volver a preguntar. Y como las decisiones se
  citan, se contradicen a la vista.
- **Locks sobre recursos compartidos.** Una base, un Redis, un puerto: mientras un agente los tiene,
  otra corrida espera. El lock vale entre procesos y entre proyectos distintos.
- **Gates que no se ganan a fuerza de reintentos.** Una verificación puede declararse no
  reintentable: si falla, la tarea se detiene para que la mire una persona, en vez de que el agente
  insista hasta el verde.

El problema que ataca no son las dudas calladas, son las **certezas falsas**: un nombre de columna
inventado con total seguridad produce una medición que parece una respuesta.

## Qué NO hace

- **Es secuencial**, un agente por vez. Es a propósito: con recursos compartidos, el paralelismo
  multiplica los accidentes.
- **No hay planificador de tareas**: corre una por invocación.
- **Solo funciona con el Claude Agent SDK.** La coordinación, los contratos y las reglas son
  independientes del motor, pero el código que ejecuta agentes todavía no está abstraído.
- **No automatiza la crítica.** Detecta que un gate falló, no que un test verifica un camino
  inexistente. Eso lo sigue haciendo una persona leyendo el reporte.

## Cómo es

- **Cantidad de agentes: libre.** Uno por repo, servicio o carpeta del monorepo.
- **Modelo por agente:** `opus`, `sonnet`, `haiku` o el id completo.
- **Stacks:** cualquiera. Lo específico son los comandos de `verificacion` y el `contrato`.
- **Scaffolding:** `npm run init` crea el proyecto con el generador oficial de cada stack, en `@latest`.
- **Spec-driven opcional:** si el proyecto declara una carpeta de specs, las entregas tienen que
  citar ids de tarea que existan.

## Documentación

- [TUTORIAL.md](./TUTORIAL.md) — crear un proyecto de cero, paso a paso, con lo que se aprendió
  usándolo en un proyecto real: costos, tamaño de las tareas y los tropiezos.
- [MANUAL.md](./MANUAL.md) — referencia completa del config y de cada mecanismo.
- [CONTROLES.md](./CONTROLES.md) — qué se midió, qué se rompió al medirlo, y qué falta probar.

## Requisitos

Node 20.12 o superior, git, y Claude Code instalado y logueado (o una `ANTHROPIC_API_KEY`).

| Carpeta | Qué hay |
|---|---|
| `proyectos/` | Un archivo por proyecto (lo único que se edita seguido) |
| `prompts/` | Instrucciones propias de cada agente |
| `src/` | Orquestador, herramientas MCP, permisos, git, verificación |
| `.orquestador/` | Estado e historial de cada tarea |

## Licencia

MIT.
# Orquestador multi-agente (Claude Agent SDK)

Varios agentes —uno por cada parte de un sistema— que se piden trabajo entre sí, con contratos
verificables, aprobación humana para lo sensible y commits en una rama aparte.

Para usarlo en un proyecto nuevo se crea **un archivo de config** en `proyectos/` y los prompts
de cada agente en `prompts/`. No se toca `src/`.

```bash
npm install
npm run listar
npm run init  -- -p pedidos                    # crea las carpetas que falten (flutter/nest/next/python...)
npm run tarea -- -p pedidos -f pedidos "Integrar la pantalla de pedidos"
```

- **Cantidad de agentes: libre.** Uno por repo, servicio o carpeta del monorepo.
- **Modelo por agente:** `opus`, `sonnet`, `haiku` o el id completo.
- **Stacks:** cualquiera. Lo específico son los comandos de `verificacion` y el `contrato`.
- **Scaffolding:** `npm run init` crea el proyecto con el generador oficial de cada stack, en `@latest`.

Empezar de cero con spec-driven: [TUTORIAL.md](./TUTORIAL.md)

Documentación completa: [MANUAL.md](./MANUAL.md) · Qué se midió y qué no: [CONTROLES.md](./CONTROLES.md)

| Carpeta | Qué hay |
|---|---|
| `proyectos/` | Un archivo por proyecto (lo único que se edita seguido) |
| `prompts/` | Instrucciones propias de cada agente |
| `src/` | Orquestador, herramientas MCP, permisos, git, verificación |
| `.orquestador/` | Estado e historial de cada tarea |

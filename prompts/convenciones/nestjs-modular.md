## Arquitectura — monolito modular

Una sola aplicación desplegable, organizada en módulos por dominio. No microservicios.

```
src/
├── core/                  Infraestructura transversal. No tiene lógica de negocio.
│   ├── helpers/           Funciones puras reutilizables por cualquier módulo
│   ├── filters/           Filtros de excepción globales
│   ├── interceptors/      Interceptores globales (serialización, logging)
│   ├── pipes/             Pipes de validación globales
│   ├── decorators/        Decoradores propios
│   ├── config/            Carga y validación de variables de entorno
│   └── prisma/            PrismaService y su módulo
├── modules/               Un subdirectorio por dominio
│   └── <dominio>/
│       ├── <dominio>.module.ts
│       ├── <dominio>.controller.ts
│       ├── <dominio>.service.ts
│       ├── dto/
│       └── <dominio>.service.spec.ts
├── app.module.ts
└── main.ts
```

### Reglas que no se negocian

1. **Una función usada por más de un módulo va a `core/helpers/`.** Si la estás por
   copiar de un módulo a otro, movela. Si solo la usa un módulo, se queda ahí: no se
   promueve "por si acaso".
2. **`core/` nunca importa de `modules/`.** La dependencia va en un solo sentido. Si
   `core` necesita algo de un módulo, la abstracción está mal puesta.
3. **Un módulo no importa el service de otro módulo directamente.** Si necesita algo de
   otro dominio, se expone en el `exports` del módulo dueño y se importa el módulo
   completo.
4. **Los controladores no tienen lógica**: validan la entrada, llaman al service y
   devuelven. Toda decisión vive en el service.
5. **Prisma solo se usa dentro de los services.** Ningún controlador ni helper toca la
   base directamente.
6. **Los DTO llevan validación declarada** y son la única forma de entrada. Nada de
   `any` ni de leer el body crudo.
7. **Lo que se repite tres veces se extrae.** Dos veces todavía no: la abstracción
   prematura cuesta más que la duplicación.

### Nombres

- Archivos en kebab-case: `publicaciones.service.ts`, `precio-por-hectarea.helper.ts`.
- Clases en PascalCase, funciones y variables en camelCase.
- Un archivo por clase exportada.

### Antes de cerrar una entrega

- `npm run build` y los tests pasan.
- Ningún import nuevo de `core/` hacia `modules/`.
- Ninguna función duplicada entre módulos que debería estar en `core/helpers/`.
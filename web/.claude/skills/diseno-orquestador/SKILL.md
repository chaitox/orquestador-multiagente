---
name: diseno-orquestador
description: Criterio visual de la interfaz web del orquestador. Usar al crear o rehacer cualquier pantalla de este repo.
---

# Diseño — interfaz del orquestador

Esta interfaz es una ventana al orquestador: muestra qué pasó y qué está pasando. No coordina
nada. Quien la use la va a tener abierta al lado de una terminal, en una segunda pantalla o en
media pantalla, mientras una corrida avanza.

Eso define todo lo demás: **es una herramienta de trabajo, no un panel de métricas para
mostrarle a nadie.**

## La regla de fondo

**El contenido manda.** El protagonista es el detalle de una tarea con su historial, y el log
de una corrida. Todo lo demás —navegación, encabezados, filtros— se queda callado alrededor.

Si una pantalla tiene más superficie dedicada a su propia decoración que a los datos, está mal.

## Jerarquía: lo que necesita a la persona va primero

El orden de importancia en cualquier pantalla:

1. **Lo que está esperando una respuesta.** Una pregunta abierta, un commit sin verificar, una
   corrida detenida. Va arriba de todo, con su propio tratamiento visual, y se ve sin buscarlo.
2. **Lo que está pasando ahora.** La tarea en curso.
3. **El historial.** Consulta.

Es la razón por la que existe esta interfaz: en la terminal, un aviso de aprobación pendiente
se pierde en el scroll y parece que el proceso se colgó. Acá no puede pasar.

## Densidad

Alta. Cuarenta tareas tienen que verse de un vistazo en una lista, no en cuarenta tarjetas con
sombra.

- Filas, no tarjetas, para cualquier lista de más de cinco elementos.
- Texto de 13 px para el contenido de las listas, 11 px para las etiquetas.
- El espacio en blanco separa secciones, no elementos de la misma lista.
- Nada de ocupar media pantalla con un encabezado.

## Oscuro desde el principio

No es un tema alternativo: es el único. Se usa junto a una terminal.

| Rol | Color |
|---|---|
| Fondo | `#131519` |
| Superficie elevada | `#16191E` |
| Borde | `#262A31` |
| Borde sutil, separador de filas | `#1F232A` |
| Texto | `#E6E8EB` |
| Texto secundario | `#B6BDC6` |
| Texto apagado | `#8A929C` |

**Los estados tienen color fijo, y no se usan para nada más:**

| Estado | Color |
|---|---|
| En curso, enlaces, acento | `#6E9FE0` |
| Completada | `#4BAE7F` |
| Aparcada, sin verificar, aviso | `#E0A33E` |
| Detenida, error | `#DB7B7B` |

El color nunca es lo único que distingue un estado: siempre lo acompaña el texto del estado.

**Tipografía:** una sans para la interfaz y una monoespaciada para todo lo que es identificador,
ruta, costo, hora o salida de comando. IBM Plex Sans e IBM Plex Mono funcionan bien y no son los
defaults de siempre. Nada de Inter, Roboto ni Arial.

## Lo que no va

- Animaciones de entrada, transiciones de página, elementos que aparecen con retardo.
- Sombras decorativas, bordes redondeados grandes, degradados.
- Íconos de adorno. Un ícono solo si reemplaza una palabra, nunca si la acompaña.
- Emoji.
- Gráficos de torta, medidores, tarjetas de métricas gigantes con un número y una flecha.
- Cualquier control que escriba algo: esta interfaz muestra. Lanzar tareas, editar specs o
  responder preguntas son otras fases, y no se adelantan "porque quedaba el lugar".

## Estados de la interfaz

Las cuatro pantallas los tratan igual, y los cuatro son distintos entre sí:

- **Cargando:** sin saltos de layout.
- **Vacío de verdad:** "este proyecto no corrió ninguna tarea" es información, no un error.
- **Dato faltante:** un proyecto sin configuración o con una raíz que no existe se muestra con
  su aviso, **nunca se esconde ni se omite de la lista**. Es justamente lo que la persona
  necesita saber.
- **Error:** el servidor caído se dice con claridad, y cuando vuelve la vista se recupera sin
  recargar la página entera.

## Accesible de verdad

- `button` y `a href` reales. Nunca un `div` con `onClick`: el tabulador lo saltea.
- Foco de teclado siempre visible, con contraste suficiente sobre el fondo oscuro.
- Texto a 4,5:1 contra su fondo; los grises apagados de arriba ya cumplen sobre `#131519`.
- Las tablas con `th` y `scope`.
- Toda la interfaz navegable con teclado: se usa mientras se escribe en otra ventana.

## Proceso

Antes de escribir CSS, escribí un plan corto: qué se ve primero en esta pantalla, qué se queda
callado, y qué estado tiene que notarse sin leer. Revisalo contra este documento: si lo primero
que se ve es el encabezado o la navegación, todavía no está.
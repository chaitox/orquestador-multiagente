# Agente "api" — FastAPI + SQLAlchemy

## Stack
- FastAPI, SQLAlchemy 2.x, Alembic para migraciones, pytest.
- Tipado estricto en los schemas de Pydantic; nada de `dict` suelto en las respuestas.

## Contrato
- Después de tocar rutas o schemas, regenerá `openapi.json`.
  Sin ese archivo actualizado no podés cerrar la entrega.

## Reglas
- Migraciones con `alembic revision --autogenerate -m "<descripcion>"`; nunca `downgrade`.
- Si el front pide algo que rompe compatibilidad, proponé una versión nueva del endpoint
  y explicá la transición en las notas de la entrega.

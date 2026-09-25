# Agente "api" — NestJS + Prisma + PostgreSQL

## Stack
- NestJS con módulos por dominio, Prisma como ORM, PostgreSQL.
- Seguí las reglas del repo en `.claude/rules/` y la skill de documentación.

## Base de datos
- Migraciones con `npx prisma migrate dev --name <descripcion>`.
- Nunca `migrate reset`, `migrate deploy` ni flags con pérdida de datos.

## Montos y facturación
- No inventes reglas fiscales (IVA, numeración de comprobantes, redondeos,
  cierres de caja). Si falta una definición, usá `no_se_puede`.

## Definición de terminado
- Compila, tests relacionados en verde y `docs/<feature>/` actualizado (es el contrato del front).

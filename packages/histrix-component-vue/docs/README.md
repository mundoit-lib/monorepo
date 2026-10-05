# histrix-component-vue — Documentación interna

> Actualizado al **2026-10-01** (rama `main`, paquete `@mundoit-lib/histrix-component-vue` v**0.1.3**; Vue 3 only desde v0.1.0).

Esta carpeta es una mini-guía para entrar rápido al proyecto: qué es, cómo está organizado, qué hace cada pieza, y por dónde tocar cuando hay que cambiar algo.

> ⚠️ **`07-backend-histrix.md` y `09-auditoria-2026-09-30.md` NO se versionan**: documentan el backend Histrix propietario (endpoints, tablas internas, mapa del código) y el repo es público. Viven solo localmente (no se mudaron al monorepo). El resto de los docs son sobre la **librería** y sí se versionan.

## Índice

- [01 — Resumen del proyecto](01-overview.md)
- [02 — Estructura del repositorio](02-estructura.md)
- [03 — Componentes y widgets](03-componentes.md)
- [04 — Servicios y configuración](04-servicios.md)
- [05 — Build y publicación](05-build-publish.md)
- [06 — Estado actual y notas](06-estado-actual.md)
- [07 — El backend Histrix, explicado para frontenders](07-backend-histrix.md) ← **empezar acá si no conocés Histrix** *(local, no versionado)*
- [08 — Plan de evolución](08-plan-evolucion.md) ← **la decisión estratégica y las fases**
  - [ADR 2026-10-01 — Cliente stateless, sin instancias](08-plan-evolucion.md#adr-2026-10-01--cliente-stateless-sin-instancias)
- [09 — Auditoría vs. Histrix (2026-09-30)](09-auditoria-2026-09-30.md) ← **gaps, bugs y qué hacer antes de seguir** *(local, no versionado, igual que 07)*

## TL;DR

- Es una **librería de componentes Vue 3 + Quasar 2** pensada para consumir el backend Histrix (XML/JSON schema-driven). Desde v0.1.0 **no soporta Vue 2** (esas apps quedan en `0.0.x`).
- Se publica en npm como `@mundoit-lib/histrix-component-vue` (monorepo `mundoit-lib/monorepo`, `packages/histrix-component-vue`).
- **Consumo source-only**: las apps clientes importan los `.vue` (import raíz, subpath o plugin) y los **compila el bundler de la app**. Solo se publica `src/` y `types/` (`files`); no hay build step.
- La superficie pública son **38 componentes** (25 top-level + 13 widgets). 37 son públicos: re-exportados desde `src/index.js` (que también provee `install()` para `app.use`) y declarados como subpaths en `package.json -> exports`; `HistrixUnsupported` es interno de `HistrixApp`.
- La lógica del motor (fórmulas, condiciones, normalización de tipos, errores de API, paginación, filtros, export, fechas…) vive en **`src/core/`**, módulos puros con tests (Vitest, `pnpm --filter @mundoit-lib/histrix-component-vue test`).
- **El cliente es stateless**: no usa las instancias de sesión del backend; lo que necesita se pide como endpoints/atributos stateless (ver el ADR en 08).
- El **dev playground** vive en `apps/playground` del monorepo: Vite + Quasar 2, consume la librería y los plugins por `workspace:*` y permite abrir cualquier XML contra un backend real (`pnpm --filter histrix-dev-playground dev`).
- Lint/format con el tooling del monorepo: **oxlint + oxfmt + sherif + knip** (`pnpm lint` / `pnpm lint:fix` en la raíz).
- Publicación por versión como el resto del monorepo: el PR bumpea `version` y al mergear a `main` `publish.yml` publica y taggea `histrix-component-vue@<version>` (ver `05-build-publish.md`).
- El rumbo del proyecto (por qué Vue 3 + Quasar 2 y no React/shadcn, fases de refactor) está en [08-plan-evolucion.md](08-plan-evolucion.md).

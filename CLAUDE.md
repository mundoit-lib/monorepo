# CLAUDE.md — monorepo @mundoit-lib

Monorepo pnpm con las librerías frontend de Mundo IT. Cada `packages/<nombre>` es un paquete npm independiente. Ver `README.md` para el flujo completo.

## Reglas para trabajar acá

- **Package manager: pnpm** (versión fijada en `packageManager`). `pnpm install` en la raíz, nunca en un paquete.
- **Un lockfile**, el de la raíz. No crear `package-lock.json` ni lockfiles por paquete.
- **devDependencies compartidas en la raíz** (`tsup`, `typescript`, `vitest`, `@biomejs/biome`, `@types/node`). Un paquete sólo declara sus `dependencies` y `peerDependencies`.
- **Finales de línea LF**, formato y lint con Biome (`pnpm lint`, `pnpm lint:fix`).
- **Tests con Vitest** en `packages/*/src/**/*.test.ts`. `pnpm test` desde la raíz.
- **Checks antes de un PR**: `pnpm lint && pnpm build && pnpm test`.
- **Vue 3 only** para todo lo nuevo. El soporte Vue 2 (`vue-demi`, `@vue/composition-api`) está deprecado y se va sacando con cada major.

## Publicación

- No se publica a mano ni se crean tags a mano.
- El PR que cambia un paquete **bumpea su `version`** (semver). Al mergear a `main`, `publish.yml` publica sólo las versiones nuevas y taggea `<paquete>@<version>`.
- Un cambio breaking es un **major** y se documenta en el README del paquete (qué cambia para la app).
- No cambiar el `name` de un paquete: las apps dependen de él.

## Git y PRs

- Repo en **GitHub** (`mundoit-lib/monorepo`): PRs con `gh pr create`, merge con squash. No usar herramientas de Bitbucket (`bb-pr`).
- Ramas por ticket de Jira (`HD-xxxx`), commits convencionales en español con la clave: `feat(plugin-vue-auth): … HD-1234`.
- Antes del PR, poner la rama al día con `main` (`bb-sync` sirve, es git puro).
- El merge a `main` lo hace una persona, salvo OK explícito.

## Paquetes

| Paquete | Entrada | Notas |
|---|---|---|
| `plugin-vue-event` | `src/index.ts` | 2.x Vue 3 only: `createEventBus`, mixin para la opción `events:`, `$events`, `useEvents()` con auto-off, tipos por `MundoitEvents` |
| `plugin-vue-auth` | `src/index.ts` | 1.x envuelve `@websanova/vue-auth`; la reescritura 2.0 (`AuthService`) está en la rama `feat/plugin-vue-auth-2` |
| `plugin-vue-axios` | `src/index.ts` | instancia axios compartida con interceptor 401→refresh (a mover a auth en 2.0) |

Consumidores: las apps `*-frontend` de Mundo IT y la librería `@mundoit-lib/histrix-component-vue` (que va a mudarse acá). Cualquier cambio de API pública tiene que pensarse para esas apps.

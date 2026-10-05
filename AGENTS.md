# AGENTS.md — monorepo @mundoit-lib

Monorepo pnpm + Turborepo con las librerías frontend de Mundo IT. Cada `packages/<nombre>` es un paquete npm independiente; `tooling/*` es configuración compartida privada (no se publica): `tooling/typescript` = `@mundoit-lib/tsconfig` y `tooling/tsdown` = `@mundoit-lib/tsdown-config`. Ver `README.md` para el flujo completo.

## Reglas para trabajar acá

- **Package manager: pnpm** (versión fijada en `packageManager`). `pnpm install` en la raíz, nunca en un paquete.
- **Node**: `.node-version` (24) para desarrollo y `publish.yml`; `ci.yml` corre en 22 y 24. `engines` sigue los pisos de tsdown/vitest: si se sube una devDependency que pide más, actualizar `engines` y la matriz.
- **Un lockfile**, el de la raíz. No crear `package-lock.json` ni lockfiles por paquete.
- **devDependencies compartidas en la raíz** (`tsdown`, `typescript`, `vitest`, `turbo`, `oxlint`, `oxfmt`, `sherif`, `publint`, `@arethetypeswrong/cli`, `knip`, `@types/node`). Un paquete sólo declara sus `dependencies` y `peerDependencies`, más los `@mundoit-lib/*` de `tooling/` como `workspace:*` en `devDependencies`.
- **tsdown compartido**: cada `packages/*/tsdown.config.ts` es `export default libraryConfig({ entry: [...] })` de `@mundoit-lib/tsdown-config`. Lo común (ESM + CJS, `platform: 'neutral'`, `es2022`, `minify: false`, `dts`, `exports: 'named'`) se cambia en `tooling/tsdown/src/index.ts`, no en el paquete. No minificar: lo hace el bundler de la app y los stack traces quedan legibles.
- **tsconfig compartido**: cada `packages/*/tsconfig.json` es `{ "extends": "@mundoit-lib/tsconfig/library.json", "include": ["src"] }`. Las opciones se cambian en `tooling/typescript` (`base.json`: strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `noEmit`…; `library.json`: lo propio de una lib publicada), no en el paquete.
- **Tareas con Turborepo** (`turbo.json`): `build`, `typecheck`, `test` y `check:exports` corren por paquete con caché. Los scripts de la raíz las llaman (`pnpm build` = `turbo run build`). Un paquete solo: `pnpm turbo run build --filter @mundoit-lib/plugin-vue-auth`.
- **Finales de línea LF**, lint con oxlint (`.oxlintrc.json`) y formato con oxfmt (`.oxfmtrc.json`). `pnpm lint` corre oxlint, `oxfmt --check`, sherif y knip; `pnpm lint:fix` corrige lo que se pueda. Los `.md` no se formatean.
- **sherif** valida la consistencia del workspace (misma versión de una dependencia en todos los paquetes, `package.json` ordenados, sin dependencias duplicadas). Si se queja, `pnpm lint:fix` o ajustar a mano; no ignorar reglas sin motivo.
- **knip** (`knip.jsonc`) marca exports, archivos y dependencias sin uso. Un export duplicado a propósito se marca con `/** @alias … */`; una dependencia que knip no ve (peers instaladas en la raíz) va en `ignoreDependencies` con el porqué.
- **Tests con Vitest** en `packages/*/src/**/*.test.ts`. Los tests de tipos (`expectTypeOf`, `@ts-expect-error`) van en `*.test-d.ts`: Vitest los valida con `tsc` (typecheck habilitado) y hacen fallar `pnpm test`. `pnpm test` corre cada paquete por turbo con la config de la raíz (`vitest run --config ../../vitest.config.ts` en el `test` de cada paquete); `pnpm test:watch` corre vitest en la raíz, con un project por paquete.
- **Checks antes de un PR**: `pnpm lint && pnpm build && pnpm typecheck && pnpm test && pnpm check:exports`.
- **Exports publicados**: `pnpm check:exports` (publint + are-the-types-wrong) sobre el `dist`. Corre en CI. Cada entrada de `exports` lleva `types` por condición (`.d.ts` para `import`, `.d.cts` para `require`).
- **Vue 3 only** para todo lo nuevo. El soporte Vue 2 (`vue-demi`, `@vue/composition-api`) está deprecado y se va sacando con cada major.
- Turborepo cambia entre versiones: antes de tocar `turbo.json` leer la doc del paquete instalado (`node_modules/turbo/docs/`).

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
| `plugin-vue-auth` | `src/index.ts` | 2.x: `AuthService` (sin websanova) + adaptador Vue 3 (`src/vue.ts`) con `$auth`/`useAuth()` compatibles con 1.x; único dueño del refresh |
| `plugin-vue-axios` | `src/index.ts` | 2.0: instancia axios compartida (`getAxiosInstance`, `setDatabase`, tipo `HttpClient`); el refresh es de auth 2.0, con `legacyRefresh` opcional para auth 1.x |

Consumidores: las apps `*-frontend` de Mundo IT y la librería `@mundoit-lib/histrix-component-vue` (que va a mudarse acá). Cualquier cambio de API pública tiene que pensarse para esas apps.

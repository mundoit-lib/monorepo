# Contexto: por qué existe este monorepo y qué hay alrededor

> Escrito el 2026-10-01 para quien trabaje en la raíz del monorepo (persona o agente). Explica el ecosistema, las decisiones tomadas y el estado de los tickets. Para las reglas operativas ver [`../AGENTS.md`](../AGENTS.md) y [`../README.md`](../README.md).

## 1. El ecosistema frontend de Mundo IT

- **Histrix** es el ERP de Mundo IT: backend PHP (Slim) donde cada pantalla se declara en un XML y se sirve por API REST como JSON schema (`GET /api/db/{db}/schema/{xml}`) más datos (`GET /api/db/{db}/app/{xml}`). Repo privado `histrix`. Multi-tenant: cada cliente tiene su base y sus XML.
- **Apps por cliente** (`angel-alvarez-frontend`, `tork-frontend`, `rodamar-frontend`, `transcaden-frontend`, `prosilo-frontend`, …): Vue 3 + Quasar 2 + UnoCSS, una por cliente. Hacen login OAuth2 (password grant) contra Histrix y renderizan las pantallas del ERP con la librería de componentes, más pantallas propias a mano. Dos apps viejas (`saldivia-frontend`, `agroactiva-frontend`) siguen en Vue 2 / Quasar 1.
- **`@mundoit-lib/histrix-component-vue`** (repo `mundoit-lib/histrix-component-vue`, publicada source-only desde `ui/`): la librería que convierte el schema de Histrix en componentes (`HistrixApp` → `HistrixTable`/`HistrixForm`/`HistrixField`/…). Es el activo principal; ~13 k líneas, Vue 3 + Quasar 2.
- **Los tres plugins de este monorepo**, usados por todas las apps y por la librería:
  - `plugin-vue-event`: bus global (`$events`, opción `events: {}` en componentes). mitt + mixin.
  - `plugin-vue-auth`: login/refresh/usuario (`$auth`, `useAuth()`). La 1.x envuelve `@websanova/vue-auth`.
  - `plugin-vue-axios`: instancia de axios compartida (`$axios`, `axiosInstance`) con `baseURL` y, en 1.x, un interceptor 401 → refresh.
- Alrededor: `histrix-portal` (portal de clientes/proveedores de un cliente, Quasar 2 + Pinia + i18n; decidió **no** usar la librería), `histrix-mcp-py` (servidor MCP para que terceros consuman la API de Histrix), `histrix-runtime` (Docker del backend).

## 2. Cómo se usan los plugins hoy (lo que no se puede romper)

| Plugin | En las apps | En la librería |
|---|---|---|
| `plugin-vue-event` | `events: { 'loaded-user'() {} }` en 3–6 archivos por app; `$events.fire(...)` 2–11 usos | dispara `login-ok`, `loaded-user`, `update-favorit`, `login-modal`, `event-after`, `edit`; escucha `reset-field`. Desde HD-7526 recibe el bus por `provide`, con `$events` como default |
| `plugin-vue-auth` | `$auth.check()`, `user()`, `login({data, redirect})`, `logout({redirect})`, `redirect()`, `ready()`, `token()`, `fetch()` — entre 9 y 15 usos por app | `auth.user(obj)` (setter), `logout`, `redirect`, `login`. Desde HD-7526 recibe un adapter por `provide`, con `useAuth()` como default |
| `plugin-vue-axios` | `boot/axios.js` llama `initializeAxios({ baseURL, db, clientID, clientSecret, fixURL })` | `getAxiosInstance()` (antes importaba `axiosInstance`) |

Las keys de `localStorage` que comparten auth y axios 1.x (`accessToken`, `refreshToken`, expiración) deben seguir funcionando al actualizar, o las sesiones se cierran.

## 3. Por qué un monorepo

Antes había cuatro repos (`plugin-vue-event`, `plugin-vue-auth`, `plugin-vue-axios`, `histrix-component-vue`), cada uno con su tooling, su lockfile y publicación manual por tag. Consecuencias concretas que se encontraron el 2026-10-01:

- Versiones publicadas desde el working tree sin commitear (1.0.2 de event, 1.0.5 de auth), y la reescritura del auth sin commitear ni rama.
- Sin tests ni README en ninguno de los tres; `"test": "exit 1"`.
- Lógica duplicada entre paquetes (dos interceptores 401 → refresh: uno en axios, otro en la reescritura del auth).
- Cambios de API entre la librería y los plugins coordinados a mano entre repos.
- `plugin-vue-axios` no compilaba con axios 1.20 (usaba un namespace de tipos que ya no existe).

El monorepo resuelve eso con un solo tooling (pnpm workspaces, Turborepo, oxlint + oxfmt, sherif, Vitest, tsdown), CI en cada PR y publicación automática **por versión**: el PR bumpea `version`, al mergear se publica sólo lo que cambió. Los nombres npm y las versiones no cambian: las apps no notan la migración. La librería de componentes entra después (HD-7548), y la idea es que todo lo frontend de Mundo IT viva acá.

## 4. Decisiones tomadas (no re-discutir sin motivo nuevo)

1. **Vue 3 only** para las versiones 2.0 de los plugins. Las 1.x quedan publicadas para las dos apps Quasar 1 hasta que se actualicen. Se eliminan `vue-demi` y `@vue/composition-api`.
2. **La librería y las apps dependen de contratos, no de paquetes**: la librería recibe bus, auth y http por `provide`/config, y usa los plugins como adaptadores por defecto si están. Los plugins **no se deprecan**.
3. **Un solo dueño del refresh de token: `plugin-vue-auth`**. `plugin-vue-axios` 2.0 deja de refrescar y de conocer `client_secret`.
4. **`plugin-vue-axios` publica el tipo `HttpClient`** (get/post/put/patch/delete + interceptors) que auth y la librería usan como contrato.
5. **Cliente stateless** (decisión de la librería, 2026-10-01): no se usan las instancias de sesión del backend (`/instance/*`); el backend tiene que funcionar como API pura porque el MCP lo expone a terceros y las apps tienen que poder ser SPA/PWA.
6. **Publicación por versión con OIDC trusted publishing**. Hasta que no se registre el repo `monorepo` + workflow `publish.yml` como publisher de cada paquete en npmjs.com (HD-7549, manual), un bump falla al publicar.
7. **LF**, oxlint + oxfmt (antes Biome, cambiado en HD-7551), sherif, Vitest, commits convencionales en español con la clave de Jira, PR con `gh`, merge a `main` sólo con OK explícito de Pablo.

## 5. Estado y tickets (Jira HD, organización MUNDO IT)

**Librería de componentes — HD-7515** (padre, 14 subtareas). Mergeadas: HD-7517 release 0.1.3, HD-7518 normalización de `type`/`histrix_type`, HD-7519 renderer numérico, HD-7520/7521 errores y notifier inyectable, HD-7522 fixtures reales y tipos, HD-7523 fórmulas reales, HD-7524 paginación server-side, HD-7525 teclado, HD-7526 contratos inyectables (`HistrixPage`, `HistrixAppDialog`, `useHistrixSession`), HD-7527 calendario, HD-7528 docs y ADR, HD-7529 grilla ING completa. En curso: **HD-7530 i18n** (la última).

**Monorepo — HD-7544** (padre):

| Ticket | Qué | Estado |
|---|---|---|
| HD-7545 | `plugin-vue-event` 2.0: Vue 3 only, `createEventBus`, `useEvents`, tipado | en curso (worktree, base `main`) |
| HD-7546 | `plugin-vue-auth` 2.0: `AuthService` sin websanova + adaptador Vue compatible con 1.x | en curso (worktree, base `feat/plugin-vue-auth-2`) |
| HD-7547 | `plugin-vue-axios` 2.0: sin refresh ni secretos, `getAxiosInstance`, `setBaseURL`, Accept JSON, `HttpClient` | en curso (worktree, base `main`) |
| HD-7548 | Mover `histrix-component-vue` acá | espera a que termine HD-7515 |
| HD-7549 | Operativo manual: trusted publishers en npm, protección de `main`, archivar repos viejos | Pablo |

Los tres de plugins no se pisan (cada uno toca sólo su `packages/<nombre>`) y corren en paralelo en worktrees de herdr (`~/.herdr/worktrees/mundoit-monorepo/hd-75xx`). **Mientras corran, no tocar `packages/*` desde la raíz**: cualquier cambio ahí les genera conflictos. Lo que sí se puede hacer desde la raíz: revisar sus PRs, tooling de la raíz, docs, `scripts/release.mjs`, workflows.

Orden de merge sugerido: HD-7547 (axios, publica `HttpClient`) → HD-7546 (auth, lo consume) → HD-7545 (event, independiente). Las tres 2.0 se publican cuando HD-7549 esté hecho.

## 6. Dónde está la información

- Auditoría completa de la librería contra el backend (gaps, bugs, uso real de los 18 k XML): `docs/09-auditoria-2026-09-30.md` en el clon local de la librería (`~/proyectos/histrix-quasar-client`, archivo gitignored porque referencia internals del backend y el repo es público).
- ADR "cliente stateless, sin instancias": `docs/08-plan-evolucion.md` de la librería.
- Contrato del backend para frontenders: `docs/07-backend-histrix.md` de la librería (local, gitignored).
- Los tickets de Jira tienen el detalle de cada cambio con stopping points y criterios de aceptación.
- Código del backend: `~/proyectos/histrix` (`src/Routing/Api.php` rutas, `src/Data/Container.php::getSchema` y `src/Data/Field.php::getSchema` para el schema).

## 7. Qué viene después

1. Cerrar HD-7545/46/47 y publicar las 2.0 (tras HD-7549).
2. Actualizar la librería para usar los adaptadores 2.0 (ya está preparada por HD-7526: sólo cambian los defaults).
3. HD-7548: traer la librería al monorepo (`packages/histrix-component-vue` + `apps/playground`), pasar a LF, y archivar el repo viejo.
4. Actualizar tork (la app más al día) como piloto de 2.0 + librería nueva; después el resto.
5. Pedidos al backend que la librería necesita y quedaron fuera por la decisión stateless: refresco de campos dependientes sin instancia, `confirmacion`/`events`/autoprint serializados en el schema, errores siempre JSON, `type`/`histrix_type` normalizados.

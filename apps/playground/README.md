# Histrix Dev Playground

App Vite + Vue 3 + Quasar 2 + **UnoCSS** para **smoke-testear** la librería
`@mundoit-lib/histrix-component-vue` contra un backend Histrix real. La librería
y los tres plugins (`plugin-vue-axios`, `plugin-vue-auth`, `plugin-vue-event`)
llegan por `workspace:*` desde `packages/`: editar su código se refleja al
instante con HMR (los plugins, después de `pnpm build`).

La configuración replica el patrón de las **apps reales de Mundo IT**
(`*-frontend`): mismos plugins con sus defaults, mismo mapeo de env, mismo guard
de router, y UnoCSS (presetUno + presetWind) para clases utility estilo Tailwind
que conviven con Quasar (`unocss.config.js`).

La librería es *source-only*: sus componentes `.vue` se compilan en vivo con el
plugin de Vue de Vite (por eso está en `optimizeDeps.exclude`).

## Configuración

1. El `.env` no se versiona. Crealo desde el ejemplo y completá host, base y
   credenciales OAuth de un backend de prueba:

   ```bash
   cp .env.example .env
   ```

2. Variables (`.env`):

   | Variable | Para qué |
   |---|---|
   | `VITE_HISTRIX_HOST` | Host del backend, sin slash final. Se vuelca a `config.apiUrl` (clave canónica; `fixApi` está deprecado). |
   | `VITE_HISTRIX_DB` | Base/cliente Histrix por defecto (el `{db}` de `/api/db/{db}/...`). |
   | `VITE_CLIENT_ID` | `client_id` OAuth2 (password grant). |
   | `VITE_CLIENT_SECRET` | `client_secret` OAuth2. |
   | `VITE_HISTRIX_MAIN_URL` | (opcional) endpoint que lista DBs visibles. Default: `${VITE_HISTRIX_HOST}/api/db/`. |

   Estos valores se vuelcan en runtime a la config de la librería en
   [`src/setup.js`](./src/setup.js) (no se toca `config.js` de la librería).

   Recordá la resolución de URL de `histrixApi.js`:
   - `host()` = `localStorage.host` || `config.fixApi` (deprecado) || host de `config.apiUrl`
   - `currentDb()` = `localStorage.database` || `config.db`
   - `apiUrl()` = `` `${host()}/api/db/${currentDb()}` ``

## Correr

Desde la raíz del monorepo (un solo `pnpm install` para todo el workspace):

```bash
pnpm install
pnpm turbo run build --filter histrix-dev-playground      # buildea los plugins (dependsOn ^build) y el playground
pnpm --filter histrix-dev-playground dev                  # http://localhost:5180
```

`pnpm build` en la raíz también buildea el playground: compila **todos** los
`.vue` de la librería y es el smoke test de compilación en CI.

## Uso

1. `/login` — formulario de login de la librería (`FormLoginNotStyles`), pega a
   `POST /api/db/{db}/token`.
2. `/` (home) — input para tipear el path de un XML y abrirlo.
3. `/app/:path` — monta `<HistrixApp :path="..." />` (pide el schema y renderiza
   la pantalla). El drawer muestra `HistrixExpansionMenu` con el menú del usuario.

## Notas de integración

- `vite.config.js` define `process.env: {}` porque `config.js` de la librería
  lee `process.env.*` (en el browser no existe `process`).
- `resolve.dedupe` garantiza una sola copia de `vue`/`quasar`/Vuelidate
  aunque la librería del workspace tenga las suyas en su `node_modules`; el alias `quasar/src/` se resuelve
  con `require.resolve` (portable entre npm y pnpm — nunca rutas a mano).
- Plugins `@mundoit-lib/plugin-vue-axios` (HTTP) y `@mundoit-lib/plugin-vue-auth`
  (auth) se instalan en [`src/main.js`](./src/main.js) con la **misma forma que
  los boot files de las apps reales**: el auth solo recibe
  `{ plugins: { http: axiosInstance, router } }` — sus defaults ya son los
  correctos para Histrix (`tokenDefaultKey: 'accessToken'`, driver que extrae
  `res.data.access_token`).
- `$events` lo provee `@mundoit-lib/plugin-vue-event` (named export
  `eventsPlugin`). La librería
  avisa por ahí `login-ok`, `loaded-user`, `update-favorit`, etc. Es opcional:
  con `VITE_NO_EVENTS=1 pnpm dev` no se instala y la librería usa su bus interno
  (así se prueba una app sin `plugin-vue-event`).
- `AppPage` usa `HistrixPage` y tiene un botón para abrir el mismo XML en
  `HistrixAppDialog`; el header usa `useHistrixSession` para `isLogged`/logout.
- `setup.js` además pre-setea `localStorage.host`/`localStorage.database`
  (igual que el boot de axios de las apps reales).

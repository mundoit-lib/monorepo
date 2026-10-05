# 02 — Estructura del repositorio

Vive en el monorepo `mundoit-lib/monorepo` (importado con `git subtree`, conserva el historial). El tooling (pnpm, turbo, oxlint/oxfmt, Vitest, CI y publicación) es el de la raíz del monorepo.

```
monorepo/
├── apps/playground/        # Playground Vite + Vue 3 + Quasar 2 (privado, NO se publica)
│   ├── package.json        # Lib + los 3 plugins por "workspace:*" (exports reales)
│   ├── vite.config.js      # @quasar/vite-plugin + define process.env + dedupe vue/quasar
│   ├── .env.example        # VITE_HISTRIX_HOST / _DB / VITE_CLIENT_ID / _SECRET
│   ├── index.html
│   ├── scripts/            # capture-fixtures.mjs, jseval-coverage.mjs (se corren a mano)
│   └── src/
│       ├── main.js         # Quasar (Notify/Dialog/Loading, lang es) + plugins mundoit + HistrixPlugin
│       ├── setup.js        # Vuelca import.meta.env.VITE_* a config de la librería
│       ├── router.js       # /login, / (home), /app/:path(.*) → HistrixApp
│       ├── App.vue         # QLayout + drawer con menú Histrix
│       └── pages/          # LoginPage, HomePage, AppPage, Register/Forgot/ResetPasswordPage
│
└── packages/histrix-component-vue/   # Paquete npm publicable
    ├── package.json        # @mundoit-lib/histrix-component-vue (files: src + types, sin build)
    ├── README.md           # README del paquete (lo que se ve en npmjs.com)
    ├── LICENSE             # MIT (Luis M. Melgratti)
    ├── docs/               # ← Esta documentación
    ├── types/              # .d.ts publicados + check/ (proyecto tsc del `typecheck`)
    │
    └── src/                # ← CÓDIGO FUENTE DE LA LIBRERÍA (esto viaja en npm)
        ├── index.js              # Imports + install(app) plugin (registra todo)
        ├── index.esm.js          # Entry del import raíz (named + default)
        ├── components/          # Componentes top-level (ver 03-componentes.md)
        │   └── widgets/         # Subcomponentes UI
        ├── core/                # Lógica PURA del motor (sin Vue/Quasar), testeada (Fase 2)
        │   ├── formula.js            # evaluador de computed_fields/jseval sin eval (parser Pratt + whitelist)
        │   ├── condition.js          # condiciones booleanas sin eval (comparaciones, && ||, and/or)
        │   ├── dataFormulas.js       # data-formulas → {required, visible, enabled}
        │   ├── keys.js               # claves primarias del schema
        │   ├── screenType.js         # schema.type → kind de pantalla
        │   ├── fieldType.js          # histrix_type → tipo de input
        │   ├── options.js            # normalización de combos (3 variantes)
        │   ├── filters.js            # querystring pseudo-OData
        │   ├── fieldVisibility.js    # editable / columnas visibles
        │   ├── dates.js              # conversión dd/mm/yyyy ↔ ISO (sin Quasar)
        │   ├── export.js             # formatos, parámetros, nombre y URL del export
        │   ├── icons.js              # íconos jQuery-UI → Material Icons
        │   ├── links.js              # destino de un helpers.link
        │   ├── schemaUri.js          # uri del schema → {path, params}; data-helpdetail
        │   ├── values.js             # compactValues / pick / omit
        │   ├── normalize.js          # type / histrix_type normalizados
        │   ├── apiError.js           # HistrixApiError (errores de API normalizados)
        │   ├── apiResponse.js        # normalizeData (204, envoltorios de paginación)
        │   ├── pagination.js         # parámetros y respuesta de la paginación server-side
        │   ├── fieldQueries.js       # query de cada combo de una fila (update_fields)
        │   ├── calendar.js           # rango visible, vistas y eventos del calendario
        │   └── *.test.js             # tests colocalizados (Vitest, 21 archivos, 310 tests)
        ├── services/            # Cliente API + helpers (ver 04-servicios.md)
        │   ├── histrixApi.js         # useApi(): todos los endpoints (agnóstico de Quasar)
        │   ├── config.js             # Config runtime (Proxy sobre process.env)
        │   ├── notify.js             # notifier inyectable (sin Quasar)
        │   ├── notify.quasar.js      # notifier por defecto con Quasar Notify/Dialog
        │   ├── histrix-bearer.js     # Driver bearer para plugin-vue-auth
        │   └── asyncComponents.js    # defineLazyComponent (async + loading/error states)
        └── utils/               # Helpers puros sin Vue (compartidos por componentes)
            └── color.js              # shade(): oscurecer/aclarar un hex (gradiente del panel auth)
```

## Notas importantes

- **Consumo source-only**: el tarball publicado contiene `src/` (sin tests ni fixtures) y `types/*.d.ts` (`files` en `package.json`). Los clientes compilan los `.vue` con su propio bundler (Vue 3 + Quasar 2).
- **Vue 3 only desde v0.1.0**: no queda código de compatibilidad Vue 2 (`vue-demi`, `.sync`, `@vue/composition-api` fueron eliminados en la Fase 1 — ver `08-plan-evolucion.md`).
- **El pipeline de build legacy (`ui/build/` del repo viejo), los entries UMD/CJS (`index.common.js`, `index.umd.js`, `index.sass`) y `umd-test.html` fueron eliminados.** Si alguna vez hace falta un bundle standalone, están en el historial de git (hasta `v0.0.199`).
- El bump de versión va en el PR (`version` del `package.json`); al mergear a `main` se publica y taggea solo (ver `05-build-publish.md`).
- Package manager: **pnpm**, un solo lockfile en la raíz del monorepo. El único npm que queda es el `npm publish` del CI (sobre el tarball de `pnpm pack`).

## Convenciones de archivos

- Componentes: **PascalCase** (`HistrixTable.vue`), excepto los widgets antiguos `profileMenu.vue`, `profileMenuItems.vue`, `notificationMenu.vue` que quedaron en camelCase.
- Cada `.vue` declara su `name:`, que es el tag con el que `install()` lo registra globalmente (`app.component(c.name, c)`).
- Las colisiones históricas de `name` están resueltas: `HistrixTree.vue` ahora declara `'HistrixTree'` (antes pisaba a `'HistrixTable'`) y el typo `'HistrixConectionSettings'` se corrigió a `'HistrixConnectionSettings'`.

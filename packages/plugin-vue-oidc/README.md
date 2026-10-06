# @mundoit-lib/plugin-vue-oidc

Autenticación OIDC para las apps Vue 3 de Mundo IT contra Histrix: authorization code + **PKCE S256**, cliente
público sin secret, refresh token con rotación y renovación automática sin iframe, sobre
[`oidc-client-ts`](https://github.com/authts/oidc-client-ts). Reemplaza al password grant de `plugin-vue-auth`
en las apps que autentican por redirección (app genérica, PWA).

Trae el **núcleo** (`createOidcAuth`), el **http** (`createOidcHttp` / `attachOidcHttp`: Bearer y reintento con
refresh ante 401) y la **capa Vue**: `OidcPlugin` (`$oidc`, `useOidcSession()`), el componente de callback y el
guard de router.

## Índice

- [Instalación](#instalación) · [Configuración mínima](#configuración-mínima)
- [Uso con histrix-component-vue](#uso-con-histrix-component-vue) (app genérica): plugin, `useOidcSession()`, `/callback`, guard, sesión expirada
- [App Quasar a medida](#app-quasar-a-medida): boot files con plugin-vue-axios 2.x
- [Multi-tenant](#multi-tenant) · [PWA y localStorage](#pwa-y-localstorage) · [Limitaciones actuales de Histrix](#limitaciones-actuales-de-histrix)
- [Http](#http-bearer-y-reintento-ante-401) · [Núcleo sin Vue](#núcleo-sin-vue) · [Tests y smoke](#tests-y-smoke)
- [Migración desde plugin-vue-auth (password grant)](#migración-desde-plugin-vue-auth-password-grant)

## Instalación

```bash
pnpm add @mundoit-lib/plugin-vue-oidc
```

`oidc-client-ts` viene como dependencia; no hay que instalarlo aparte. Peers: `vue` 3 y `axios` (lo usa
`createOidcHttp`; las apps ya lo tienen). No depende de `vue-router`: el plugin recibe el router de la app y usa
`push`, `replace`, `beforeEach` y `currentRoute`.

## Configuración mínima

```js
import { createOidcAuth } from '@mundoit-lib/plugin-vue-oidc';

export const auth = createOidcAuth({
  issuer: { host: 'https://cliente.histrix.com.ar', db: 'demo' } // → https://cliente.histrix.com.ar/api/db/demo
});
```

Con eso alcanza para una app con un solo Histrix: el resto son defaults pensados para Histrix.

| Opción | Default | Qué es |
|---|---|---|
| `issuer` | — | `{ host, db }` o la URL del issuer. Puede faltar y fijarse con `setIssuer()` ([multi-tenant](#multi-tenant)). |
| `clientId` | `'histrix-app'` | Cliente **público** (sin secret) dado de alta en el `oauth_clients` del Histrix del cliente. |
| `scope` | `'openid profile email offline_access'` | `offline_access` pide el refresh token; sin él la sesión dura lo que el access token. |
| `redirectUri` | `${location.origin}/callback` | Tiene que coincidir **exacto** con el `redirect_uri` registrado en Histrix. |
| `postLogoutRedirectUri` | `${location.origin}/` | A dónde vuelve el `end_session`, cuando Histrix lo tenga. |
| `storage` | `localStorage` | Dónde viven tokens y usuario ([PWA y localStorage](#pwa-y-localstorage)). |
| `userKey` | `'user'` | Key del usuario de la app en `storage`; es la que lee `useHistrixSession`. |
| `issuerTemplate` | `'{host}/api/db/{db}'` | Cómo se arma el issuer desde `{ host, db }`. |
| `userManagerSettings` | — | Pisa los settings del `UserManager` de `oidc-client-ts` (escape hatch). |

Del lado de Histrix hace falta que el issuer responda el discovery (`<issuer>/.well-known/openid-configuration`) y
que exista el cliente público con ese `redirect_uri`; el SQL está en la
[guía de migración](#2-dar-de-alta-el-cliente-público-en-el-histrix-del-cliente). La app necesita una ruta
`/callback` (o la que diga `redirectUri`) que llame a `handleCallback()`: el componente `OidcCallback` ya lo hace.

## Uso con histrix-component-vue

```js
import { createOidcAuth, createOidcHttp, OidcPlugin } from '@mundoit-lib/plugin-vue-oidc';
import HistrixPlugin from '@mundoit-lib/histrix-component-vue/plugin';
import router from './router';

export const auth = createOidcAuth({
  issuer: { host: 'https://cliente.histrix.com.ar', db: 'demo' }, // o la URL del issuer, o nada y setIssuer() después
  clientId: 'histrix-app', // default
  scope: 'openid profile email offline_access', // default
  redirectUri: `${location.origin}/callback`, // default
  postLogoutRedirectUri: `${location.origin}/` // default
});

// axios con Bearer del OIDC y reintento ante 401 (ver "Http").
export const http = createOidcHttp(auth, { baseURL: 'https://cliente.histrix.com.ar/api/db/demo' });

const app = createApp(App);
// Cumple el contrato de auth de histrix-component-vue: se pasa directo.
app.use(HistrixPlugin, { auth, http, onUnauthorized: () => router.push({ name: 'login' }) });
// Restaura la sesión, instala el guard en router.beforeEach y provee $oidc / useOidcSession().
app.use(OidcPlugin, {
  auth,
  router,
  loginRoute: { name: 'login' }, // default '/login'
  publicMeta: 'public', // default: rutas con meta.public no piden sesión
  onSessionExpired: () => Notify.create('Tu sesión venció, volvé a ingresar')
});
app.use(router);
app.mount('#app');
```

El orden entre `app.use(OidcPlugin)` y `app.use(router)` no importa: el guard **espera el `restore()`** antes de
decidir la navegación inicial, así que al recargar una ruta privada con sesión guardada no manda al login (bug de la
PoC, donde el guard corría antes de restaurar).

### Opciones de `OidcPlugin`

| Opción | Qué hace |
|---|---|
| `auth` | El núcleo (`createOidcAuth`). Obligatorio. |
| `router` | Con router, `logout({ redirect })` navega con `router.push` y se instala `createOidcGuard` en `beforeEach`. |
| `guard` | `false`: no instalar el guard (la app arma el suyo con `createOidcGuard`). Default `true`. |
| `loginRoute` / `publicMeta` / `callbackRoute` | Opciones del guard (abajo). |
| `restore` | `false`: no llamar a `restore()` al instalar. Multi-tenant sin issuer al arrancar: después de `auth.setIssuer()` la app llama a `useOidc().restore()`. Default `true`. |
| `onSessionExpired` | Se llama cuando la sesión vence sin renovarse (`auth.onSessionExpired`). |
| `globalProperty` | Nombre de la propiedad global (`this.$oidc`); `false` para no registrarla. Default `'$oidc'`. |

### `useOidcSession()` / `useOidc()` / `$oidc`

Misma forma que `useHistrixSession()` de histrix-component-vue, para que la app tenga una sola fuente de verdad.
Funciona fuera de un componente (stores, boot) si el plugin ya está instalado.

```js
const { user, isLogged, login, logout, renew, ready } = useOidcSession();
```

| Miembro | Qué es |
|---|---|
| `user` | `shallowRef` con `auth.user()`: el usuario de la app (`setUser`, lo que trae `/me`) o los claims de la sesión OIDC. |
| `isLogged` | `computed` con `auth.check()`: hay sesión con access token vigente. Puede haber `user` persistido e `isLogged` en `false`. |
| `ready` | `shallowRef`: terminó el `restore()` inicial. |
| `login({ redirect? })` | Redirige al authorize. Sin `redirect`, toma `?redirect=` de la ruta actual (lo deja el guard) si es una ruta de la app. La promesa no resuelve. |
| `logout({ redirect?, endSession? })` | Igual que el núcleo; con router, navega con `router.push`. |
| `renew()` | Renovación con refresh token. |
| `restore()` / `restoring()` | Carga la sesión guardada; `restoring()` es la promesa que espera el guard. |
| `auth` | El núcleo. |

### Ruta `/callback`

Componente listo (slot opcional) o composable:

```vue
<!-- CallbackPage.vue -->
<template>
  <OidcCallback :router="router" :on-login="traerUsuario">
    <template #default="{ status, message, retry }">
      <q-spinner v-if="status === 'pending'" />
      <q-banner v-else-if="status === 'error'">
        {{ message }}
        <template #action><q-btn flat label="Volver a ingresar" @click="retry" /></template>
      </q-banner>
    </template>
  </OidcCallback>
</template>

<script setup>
import { OidcCallback } from '@mundoit-lib/plugin-vue-oidc';
import { useHistrixSession } from '@mundoit-lib/histrix-component-vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const session = useHistrixSession();
// Con el access token ya puesto, la lib trae /me y lo publica como user.
const traerUsuario = () => session.refresh();
</script>
```

```js
// O el composable, en un componente propio:
const { status, error, message, run, retry } = useOidcCallback({ onLogin, redirect, url, immediate }, router);
```

Canjea el code, guarda la sesión, espera `onLogin(user, oidc)` y navega a `state.redirect` (el `redirect` de
`login()`) con `router.replace`; sin router usa `auth.navigate`. Sólo navega a rutas de la app (`/...`); cualquier
otro destino cae a `/`. Si algo falla, `status` queda en `'error'` con un
`message` para la persona (`describeCallbackError`: code vencido o ya usado = `invalid_grant`, `invalid_client`,
`access_denied`, state perdido, sin issuer) y `retry()` vuelve al authorize. Sin slot, el componente muestra
`pendingText` ("Ingresando…") o el mensaje con un botón `retryText`, en HTML plano (clases `oidc-callback`,
`oidc-callback--error`); emite `error`.

### Guard

```js
import { createOidcGuard, useOidc } from '@mundoit-lib/plugin-vue-oidc';

// Lo instala el plugin; a mano (guard: false) para combinarlo con otros chequeos:
router.beforeEach(createOidcGuard(useOidc(), { loginRoute: '/login', publicMeta: 'public' }));
```

Las rutas con `meta[publicMeta]` (en cualquier record de `matched`), la propia ruta de login y la del **callback**
pasan. La del callback se toma del `redirectUri` del núcleo (`/callback` por defecto): la vuelta del authorize
todavía no tiene sesión y, sin esta excepción, el guard la mandaría al login perdiendo el code. `callbackRoute`
la cambia (`'/oidc/vuelta'`) o la apaga (`false`, y la app la marca con `meta[publicMeta]`). El resto espera
`restoring()` y, sin sesión, devuelve `loginRoute` con `query.redirect = to.fullPath`. `loginRoute` puede ser una
ruta (`'/login'`), un objeto de vue-router (`{ name: 'login' }`, se mezcla la `query`) o una función de la ruta
bloqueada.

### Sesión expirada

`auth.onSessionExpired(cb)` (y la opción `onSessionExpired` del plugin) se dispara cuando una sesión viva vence sin
poder renovarse: el access token expiró y el refresh falló o no había, `restore()` encontró una sesión guardada que
ya no sirve, o el issuer rechazó el refresh (`invalid_grant`: token vencido, revocado o ya rotado). Un fallo de red,
un 5xx o un timeout en el refresh **no** lo disparan ni descartan la sesión: el token vigente sigue y el próximo
intento puede andar. `logout()` no lo dispara. `isLogged` pasa a `false`; `user` conserva el usuario
persistido hasta el próximo login o logout.

## App Quasar a medida

Las apps `*-frontend` (Quasar CLI, Vue 3) arman todo en boot files. Con OIDC quedan dos: `boot/axios.js` crea la
instancia compartida de plugin-vue-axios 2.x y `boot/oidc.js` le attachea el Bearer e instala el plugin. El orden en
`quasar.config.js` importa: `boot: ['axios', 'oidc', 'componentHistrix', ...]`.

```js
// src/boot/axios.js
import { defineBoot } from '#q-app/wrappers';
import { install as axiosPlugin } from '@mundoit-lib/plugin-vue-axios';

export default defineBoot(({ app }) => {
  // Sin legacyRefresh ni clientID/clientSecret: el refresh es de plugin-vue-oidc.
  app.use(axiosPlugin, { baseURL: `${process.env.API_URL}/api/db/${process.env.DB}` });
});
```

```js
// src/boot/oidc.js
import { defineBoot } from '#q-app/wrappers';
import { Notify } from 'quasar';
import { getAxiosInstance } from '@mundoit-lib/plugin-vue-axios';
import { attachOidcHttp, createOidcAuth, OidcPlugin } from '@mundoit-lib/plugin-vue-oidc';

export const auth = createOidcAuth({
  issuer: { host: process.env.API_URL, db: process.env.DB }
});

export default defineBoot(({ app, router }) => {
  attachOidcHttp(getAxiosInstance(), auth); // Bearer + reintento con refresh ante 401
  app.use(OidcPlugin, {
    auth,
    router,
    loginRoute: { name: 'login' },
    onSessionExpired: () => Notify.create({ type: 'warning', message: 'Tu sesión venció, volvé a ingresar' })
  });
});
```

```js
// src/boot/componentHistrix.js
import { defineBoot } from '#q-app/wrappers';
import HistrixPlugin from '@mundoit-lib/histrix-component-vue/plugin';
import { getAxiosInstance } from '@mundoit-lib/plugin-vue-axios';
import { auth } from './oidc';

export default defineBoot(({ app, router }) => {
  // La lib toma `$auth` de plugin-vue-auth si está instalado; con OIDC se le pasa el núcleo a mano.
  app.use(HistrixPlugin, { auth, http: getAxiosInstance(), onUnauthorized: () => router.push({ name: 'login' }) });
});
```

Rutas: todo es privado salvo lo que lleve `meta.public`. La de login es pública por ser `loginRoute`; la de
callback pasa siempre porque es el `redirectUri` del núcleo.

```js
// src/router/routes.js
export default [
  { path: '/login', name: 'login', component: () => import('pages/LoginPage.vue'), meta: { public: true } },
  { path: '/callback', component: () => import('pages/CallbackPage.vue'), meta: { public: true } },
  { path: '/', component: () => import('layouts/MainLayout.vue'), children: [/* privadas */] }
];
```

La página de login ya no tiene formulario de usuario y contraseña: un botón que redirige al authorize de Histrix.
`login()` sin argumentos toma el `?redirect=` que dejó el guard.

```vue
<!-- src/pages/LoginPage.vue -->
<template>
  <q-page class="flex flex-center">
    <q-btn color="primary" label="Ingresar con Histrix" :loading="entrando" @click="entrar" />
  </q-page>
</template>

<script setup>
import { ref } from 'vue';
import { useOidcSession } from '@mundoit-lib/plugin-vue-oidc';

const { login } = useOidcSession();
const entrando = ref(false);
const entrar = () => {
  entrando.value = true;
  return login(); // navega al authorize; la promesa no resuelve
};
</script>
```

`CallbackPage.vue` es el `OidcCallback` de [más arriba](#ruta-callback), con `onLogin` trayendo `/me` vía
`useHistrixSession().refresh()` si la app muestra datos del usuario de Histrix.

En componentes, `this.$oidc` (Options API) o `useOidcSession()` reemplazan a `this.$auth` / `useAuth()`; la
[tabla de equivalencias](#4-reemplazar-auth-por-oidc-en-la-app) está en la guía de migración.

## Multi-tenant

La app genérica no sabe contra qué Histrix autenticar hasta resolver el tenant (código, link `/c/<codigo>` u
hostname). El núcleo se crea **sin issuer**, el plugin no restaura al instalar y, con el tenant resuelto, se fija el
issuer y recién ahí se restaura la sesión:

```js
export const auth = createOidcAuth(); // sin issuer: login()/restore() devuelven null hasta setIssuer()

app.use(OidcPlugin, { auth, router, restore: false });

// Con el tenant resuelto (al arrancar, o cuando la persona lo elige):
import { setBaseURL } from '@mundoit-lib/plugin-vue-axios';
import { resolveIssuer, useOidc } from '@mundoit-lib/plugin-vue-oidc';

function aplicarTenant({ host, db }) {
  auth.setIssuer({ host, db }); // un UserManager por issuer; descarta la sesión del anterior
  setBaseURL(`${host}/api/db/${db}`); // el http sigue al tenant; setDatabase(db) si sólo cambia la base
  return useOidc().restore(); // el guard espera esta promesa antes de la navegación inicial
}
```

- `resolveIssuer({ host, db })` y `tenantFromIssuer(url)` convierten entre tenant e issuer con `issuerTemplate`.
- `setIssuer()` borra la sesión y el usuario de la app del tenant anterior: cambiar de tenant es cerrar sesión.
- El guard del plugin sólo mira la sesión. Para mandar a "elegir tenant" cuando no hay ninguno, registrar un
  `router.beforeEach` propio **antes** de `app.use(OidcPlugin)` (vue-router los corre en orden) o pasar
  `guard: false` y componer el propio con `createOidcGuard(useOidc(), opciones)`.
- Cada Histrix tiene su propio `oauth_clients`: el `redirect_uri` de **cada host** desde el que se entra
  (`https://app.histrix.com.ar/callback`, `https://tork.app.histrix.com.ar/callback`, el dominio del cliente) tiene
  que estar dado de alta en el Histrix de ese tenant.

## PWA y localStorage

Por defecto tokens y usuario de la app van a `localStorage`, para que una PWA instalada abra con sesión aunque se
haya cerrado el browser, y el refresh es siempre con refresh token (sin iframe: en móvil y en PWA instalada el silent
renew por iframe no funciona). Qué implica:

- **Cualquier script del mismo origen lee los tokens.** Un XSS en la app es robo de sesión; la rotación del refresh
  token (cada refresh invalida el anterior) acota el daño pero no lo evita. Vale lo de siempre: nada de `v-html` con
  datos del servidor, dependencias al día, CSP si se puede.
- **El refresh token dura lo que diga Histrix** (hoy 14 días) y, como no hay revocación ni `end_session`,
  `logout()` sólo borra lo local: un token copiado antes sigue valiendo hasta vencer o rotar. Ver
  [limitaciones](#limitaciones-actuales-de-histrix).
- **La sesión se comparte entre pestañas** del mismo origen (es el mismo `localStorage`). `oidc-client-ts` se
  entera de los cambios de otra pestaña al leer el storage; un `logout()` en una pestaña deja a las demás sin token en
  el próximo request.
- **Los timers se suspenden** cuando la PWA pasa a segundo plano: el `automaticSilentRenew` puede no correr a
  tiempo. No pasa nada: el próximo request recibe 401, el http hace `renew()` y reintenta. Si el refresh token también
  venció, se dispara `onSessionExpired` y la persona vuelve a ingresar.
- Para una sesión que muera con la pestaña, `storage: sessionStorage`. Para otro medio (memoria, IndexedDB con
  adaptador sincrónico) cualquier objeto con la forma de `Storage` (`getItem`/`setItem`/`removeItem`/`key`/`length`).
- La página de `/callback` tiene que estar **precacheada** por el service worker (en Quasar PWA, todo el `dist` lo
  está): la vuelta del authorize es una navegación completa y si el SW no la sirve offline-first, un corte de red en
  ese instante pierde el code (se puede reintentar: el botón `retry()` del callback vuelve al authorize).

## Limitaciones actuales de Histrix

Lo que hoy no hace el OIDC de Histrix y cómo lo maneja la librería; el detalle y el seguimiento están en
[HD-7688](https://mundoit.atlassian.net/browse/HD-7688).

| Falta | Consecuencia | Qué hace plugin-vue-oidc |
|---|---|---|
| `end_session_endpoint` y revocación de tokens | "Salir" no cierra la sesión del servidor: el refresh token sigue válido hasta vencer (14 días). | `logout()` borra tokens y usuario locales; si el discovery algún día anuncia `end_session_endpoint`, redirige ahí solo (`endSession: false` lo evita). |
| Consent recordado | La pantalla de autorización aparece **en cada login**, también para el cliente propio `histrix-app`. | Nada que hacer del lado del cliente; con sesión guardada no hay login, así que en la práctica se ve una vez cada 14 días o al cerrar sesión. |
| Access token corto | Dura 24 h; un token robado vale todo ese tiempo. | Usa el token hasta que vence y recién ahí refresca (o ante un 401). |
| `none` en `token_endpoint_auth_methods_supported` y `offline_access` en `scopes_supported` | El discovery no anuncia lo que el cliente público usa. | `oidc-client-ts` no valida esos campos: anda igual. Si otro cliente OIDC más estricto se queja, es esto. |
| Cliente `histrix-app` precargado | Hay que insertarlo a mano en `oauth_clients` de cada Histrix, con los `redirect_uri` de cada host. | Ver el SQL de la [guía de migración](#2-dar-de-alta-el-cliente-público-en-el-histrix-del-cliente). |
| `.well-known` y CORS en algunos proxies | Caddy/nginx de producción pueden bloquear `/.well-known/openid-configuration` o no mandar `X-Forwarded-Proto`, y el discovery falla o devuelve URLs `http://`. | El error llega al callback como "sin issuer"/red; se arregla en el proxy del cliente. |

## Http: Bearer y reintento ante 401

```js
import { createOidcHttp, attachOidcHttp } from '@mundoit-lib/plugin-vue-oidc';

// Instancia nueva (reemplaza al `http.js` de la app genérica): axios.create(config) ya attacheado.
const http = createOidcHttp(auth, { baseURL });

// O sobre una instancia existente, p. ej. la de plugin-vue-axios 2.x.
import { getAxiosInstance } from '@mundoit-lib/plugin-vue-axios';
const detach = attachOidcHttp(getAxiosInstance(), auth);
```

- **Request**: `Authorization: Bearer <access token vigente>` (`auth.getToken()`). Sin sesión no toca los headers.
  Nunca manda `client_id` ni `client_secret`: el cliente es público.
- **Response 401**: una vez por request, `auth.renew()` (refresh token) y se repite el pedido con el token nuevo.
  Si el refresh falla o no deja sesión, se propaga el **401 original**: la librería no decide por la app
  (histrix-component-vue dispara `onUnauthorized` con ese rechazo). Un reintento que vuelve a dar 401 también se
  propaga, sin loop. Los demás errores (403, 500, red) pasan sin tocar.
- **Un solo refresh**: `renew()` comparte la renovación en vuelo por issuer, así varios 401 simultáneos gastan un
  único refresh token (con rotación, dos refresh a la vez perderían la sesión).
- `attachOidcHttp` es idempotente por instancia y devuelve el detach, que saca los dos interceptores.
- Acepta cualquier `HttpClient` de `@mundoit-lib/plugin-vue-axios/http` (2.1+), no sólo axios.

**Con plugin-vue-axios 2.x**, plugin-vue-oidc es el **único dueño del refresh** (la misma regla que
plugin-vue-auth 2.0): no pasar `legacyRefresh` a `initializeAxios`, ni attachear además un `AuthService`. El
`baseURL` lo sigue manejando plugin-vue-axios (`setBaseURL`, `setDatabase`); al cambiar de tenant, `setIssuer()`
y `setDatabase()` van juntos.

## Núcleo sin Vue

```js
// Al arrancar: sesión guardada + refresh si venció.
await auth.restore();

// Ruta /callback:
const { redirect } = await auth.handleCallback(window.location.href);
router.replace(redirect);
```

| Método | Qué hace |
|---|---|
| `login({ redirect })` | `signinRedirect` con `state.redirect`. La promesa no resuelve: la página navega al authorize. |
| `handleCallback(url?)` | Canjea el code, guarda la sesión y devuelve `{ user, redirect }`. |
| `restore()` | Carga la sesión guardada; si venció y hay refresh token, la renueva. `null` sin sesión. |
| `renew()` | Fuerza una renovación con refresh token (p. ej. ante un 401). Una sola renovación en vuelo por issuer: llamadas simultáneas comparten la misma promesa, así no se gasta dos veces el refresh token rotado. |
| `logout({ redirect, endSession })` | Borra tokens y usuario local. Si el discovery trae `end_session_endpoint`, redirige ahí; si no, llama a `navigate(redirect)`. El `navigate` por defecto sólo acepta rutas de la app (`/...`, nunca `//host` ni otro esquema). |
| `getToken()` / `token()` | Access token vigente o `null`. |
| `user()` / `setUser(u)` | Usuario de la app guardado en `storage` bajo `user` (la key que lee `useHistrixSession`). Sin usuario de la app, `user()` devuelve los claims (`profile`) de la sesión OIDC. |
| `check()` | Hay sesión OIDC con access token sin vencer. |
| `onUserChange(cb)` | Cambios de `user()`; devuelve el unsubscribe. |
| `onSessionExpired(cb)` | La sesión venció sin renovarse o el issuer rechazó el refresh (ver arriba; los errores de red no cuentan); devuelve el unsubscribe. |
| `setIssuer(issuer \| null)` / `getIssuer()` | Multi-tenant: un `UserManager` por issuer; cambiar descarta la sesión y el usuario de la app del anterior. |
| `getUserManager()` | El `UserManager` actual, para usos avanzados. |

`resolveIssuer({ host, db })` y `tenantFromIssuer(url)` convierten entre tenant e issuer con la plantilla
`{host}/api/db/{db}` (`issuerTemplate` la cambia).

Opciones: `storage` (por defecto `localStorage`, para que la PWA sobreviva al cierre del browser), `userKey`,
`userManagerSettings` (pisa los settings de `UserManager` que arma el plugin).

## Tests y smoke

`pnpm test` corre dos niveles, los dos en CI y sin servidor ni browser:

- **Unitarios** (`OidcAuth.test.ts`, `http.test.ts`, `vue.test.ts`, `guard.test.ts`, `callback.test.ts`): `UserManager`
  mockeado. Prueban la lógica del plugin: sesión, eventos, Bearer y reintento, guard, callback.
- **De protocolo** (`OidcAuth.protocol.test.ts`): `oidc-client-ts` **real** contra un issuer falso (`fake-issuer.ts`)
  que contesta por `fetch` el discovery, el token endpoint (`authorization_code` validando el `code_verifier` S256,
  `refresh_token` con rotación, errores OAuth como Histrix) y `/userinfo`. Cubren el canje del code con PKCE, restore
  sin sesión / con access vencido y refresh OK / con refresh rechazado o con error transitorio, callback con state
  inválido o code rechazado, rotación del refresh (el anterior deja de servir, un refresh viejo tira la sesión),
  401 → refresh → reintento con `attachOidcHttp`, cambio de issuer en runtime y logout.

### Smoke contra el container local (manual, fuera de CI)

`scripts/smoke.mjs` levanta una app mínima sobre el `dist/` del paquete (sin Vue) en `http://localhost:5190`, el
`redirect_uri` registrado para el client `histrix-app`, y la maneja con `playwright-core` y el Chrome del sistema
contra un Histrix real:

```bash
pnpm build
HTX_PASS=… pnpm --filter @mundoit-lib/plugin-vue-oidc smoke
```

| Variable | Default | Qué es |
|---|---|---|
| `HTX_HOST` / `HTX_DB` | `http://localhost` / `htx_test` | Tenant: el issuer es `{host}/api/db/{db}`. |
| `HTX_USER` / `HTX_PASS` | `histrix` / (obligatoria) | Usuario de Histrix que se loguea. |
| `SMOKE_ORIGIN` | `http://localhost:5190` | Origen del `redirect_uri` registrado para el client en `oauth_clients`. El servidor del smoke escucha en un puerto libre y Chrome resuelve ese origen hacia él (`--host-resolver-rules`), así que no importa que el puerto real lo tenga la app genérica. |
| `CHROME` | `/usr/bin/google-chrome` | Binario de Chrome/Chromium (no se bajan browsers). |
| `SHOT` | vacío | Path para una captura final. `HEADED=1` abre el browser. |

Requisitos: el container `histrix` arriba con la base, el client `histrix-app` con `redirect_uri`
`http://localhost:5190/callback` y Chrome instalado. Qué verifica, en orden:

1. `/connect` → `login()`: discovery y authorize con `response_type=code`, `code_challenge_method=S256` y `offline_access`.
2. Login de Histrix y consent, si lo pide.
3. `/callback`: canje del code con `code_verifier` y sin `client_secret`; vuelta al `redirect` del state; sesión guardada
   en `localStorage` con access, refresh e id_token.
4. `GET /me` y `GET /menu/phpmen` con Bearer.
5. **401 de verdad**: pisa el access token guardado por uno inválido y recarga. Histrix contesta 401, el plugin renueva
   con el refresh token (un solo `POST /token` con `grant_type=refresh_token`), reintenta y el refresh token rota.
6. `logout()` borra la sesión.

Termina con `N checks OK` o la lista de los que fallaron (exit 1). El `401` que queda en la consola del browser es el
del paso 5. `SMOKE_DEBUG=1` muestra además lo que sirve el servidor de la app.

El access token de Histrix dura 24 h (`ACCESS_LIFETIME`), por eso el 401 se provoca invalidando el token del lado del
cliente. Para vencerlo del lado del servidor, en la base del tenant:
`UPDATE oauth_access_tokens SET expires = NOW() - INTERVAL 1 DAY WHERE access_token = '<token>'`.

## Migración desde plugin-vue-auth (password grant)

Para una app a medida que hoy autentica con `@mundoit-lib/plugin-vue-auth` (formulario de usuario y contraseña,
`grant_type=password` con `client_id`/`client_secret` en el bundle) y pasa a OIDC por redirección. Lo que cambia para
la persona: en vez de un formulario en la app, un botón que la lleva al login de Histrix y vuelve con sesión.

### 1. Qué desaparece del `.env`

| Variable | Antes | Después |
|---|---|---|
| `CLIENT_ID` / `CLIENT_SECRET` | Credenciales del cliente OAuth confidencial, embebidas en el JS de la app. | **Se borran.** El cliente OIDC es público: `histrix-app` sin secret, y va en código (`clientId`), no en `.env`. |
| `API_URL` / `FIX_API_URL` | Host del Histrix del cliente. | Queda uno solo (`API_URL`): arma el `issuer` y el `baseURL`. |
| `DB` | Base de Histrix. | Queda. |

Si el `.env` se versiona o se comparte, rotar el `client_secret` en Histrix después de sacarlo: estuvo público en
cada build.

### 2. Dar de alta el cliente público en el Histrix del cliente

Una fila en `oauth_clients` (tabla de `oauth2-server-php`) por Histrix, con `client_secret` vacío. El
`redirect_uri` es **exacto** (esquema, host, puerto y path): si la app se sirve desde varios hosts (dev, staging,
producción, dominio propio del cliente), van todos separados por espacio.

```sql
INSERT INTO oauth_clients (client_id, client_secret, redirect_uri, grant_types, scope)
VALUES ('histrix-app', '',
        'https://app.cliente.com.ar/callback http://localhost:9000/callback',
        'authorization_code refresh_token',
        'web openid profile email offline_access');
-- y que existan openid, profile, email y offline_access en oauth_scopes (is_default = 0):
INSERT IGNORE INTO oauth_scopes (scope, is_default) VALUES
  ('openid', 0), ('profile', 0), ('email', 0), ('offline_access', 0);
```

`web` es el scope de la API de Histrix (el que ya usaba el password grant); `offline_access` es el que devuelve el
refresh token. El cliente del password grant se puede dejar hasta que todas las builds con él estén fuera de uso.

Verificar el discovery desde el browser: `https://<host>/api/db/<db>/.well-known/openid-configuration` tiene que
responder JSON con `authorization_endpoint`, `token_endpoint` y `code_challenge_methods_supported` con `S256`. Si
no responde o las URLs salen `http://`, es el proxy ([limitaciones](#limitaciones-actuales-de-histrix)).

### 3. Boot files

| Archivo | Antes (plugin-vue-auth 1.x/2.x + plugin-vue-axios 1.x) | Después |
|---|---|---|
| `boot/axios.js` | `install(app, { baseURL, db, clientID, clientSecret, fixURL })`: la instancia refrescaba el token con el secret. | plugin-vue-axios **2.x**, sólo `{ baseURL }`. Sin `legacyRefresh`: el refresh es de plugin-vue-oidc. |
| `boot/auth.js` | `app.use(AuthPlugin, { http, router, oauth: { clientId, clientSecret }, endpoints })`. | **Se borra.** Lo reemplaza `boot/oidc.js` ([App Quasar a medida](#app-quasar-a-medida)). |
| `boot/componentHistrix.js` | `app.use(HistrixPlugin)`: la lib tomaba `$auth` y `$axios` sola. | `app.use(HistrixPlugin, { auth, http: getAxiosInstance(), onUnauthorized })`: el `auth` se pasa a mano. |
| `localStorage.setItem('host' / 'database')` y `config.clientId` / `config.clientSecret` de histrix-component-vue | Configuración runtime con credenciales. | `config.apiUrl` y `config.db` siguen si la app los usa; `clientId`/`clientSecret` ya no se setean. |
| `quasar.config.js` → `boot` | `['axios', 'auth', 'componentHistrix', ...]` | `['axios', 'oidc', 'componentHistrix', ...]` |

```bash
pnpm remove @mundoit-lib/plugin-vue-auth
pnpm add @mundoit-lib/plugin-vue-oidc @mundoit-lib/plugin-vue-axios@^2
```

### 4. Reemplazar `$auth` por `$oidc` en la app

| plugin-vue-auth (`$auth` / `useAuth()`) | plugin-vue-oidc (`$oidc` / `useOidcSession()`) |
|---|---|
| `$auth.check()` | `$oidc.isLogged.value` (`isLogged` en el composable) |
| `$auth.user()` / `$auth.user('nombre')` | `$oidc.user.value` / `$oidc.user.value?.nombre` |
| `$auth.user(obj)` | `$oidc.auth.setUser(obj)` |
| `$auth.login({ data: { username, password }, redirect })` | `$oidc.login({ redirect })`: redirige al authorize, no recibe credenciales. |
| `$auth.logout({ redirect })` | `$oidc.logout({ redirect })` |
| `$auth.token()` | `$oidc.auth.getToken()` |
| `$auth.ready()` / `await $auth.load()` | `$oidc.ready.value` / `await $oidc.restoring()` |
| `$auth.fetch()` (volver a pedir `/me`) | `useHistrixSession().refresh()` de histrix-component-vue |
| `$auth.redirect()` | `route.query.redirect` (el guard lo deja en la query de `loginRoute`) |
| `useAuth().isAuthenticated` / `.currentUser` | `useOidcSession().isLogged` / `.user` |
| `inject('mundoitAuth')` / `auth.service` | `useOidc().auth` (el núcleo) |

El guard también se invierte: plugin-vue-auth protegía sólo las rutas con `meta.auth` y mandaba a `authRedirect`;
plugin-vue-oidc protege **todas** salvo las que tienen `meta.public` (o la key de `publicMeta`) y manda a
`loginRoute` con `?redirect=`. Al migrar, marcar como públicas las que antes no tenían `meta.auth` (login, recuperar
contraseña, páginas institucionales) y sacar `meta.auth` del resto.

### 5. Pantallas de login

- El formulario propio (o `HistrixLoginSplit` / `LoginForm` de histrix-component-vue) se reemplaza por un botón que
  llama a `login()`. Los componentes de la lib siguen funcionando porque `login({ username, password })` ignora las
  credenciales y redirige, pero no tiene sentido pedir una contraseña que no se usa.
- Registro, "olvidé mi contraseña" y cambio de contraseña pasan a ser de Histrix (sus pantallas, en el authorize);
  `HistrixRegisterSplit`, `HistrixForgotPasswordSplit` y `HistrixPasswordChange` dejan de usarse en la app.
- Nueva ruta `/callback` con `OidcCallback` ([arriba](#ruta-callback)).
- Las sesiones del password grant (keys `accessToken`, `refreshToken`, `tokenExpireDate` en `localStorage`) no se
  migran: al desplegar, todas las personas vuelven a ingresar una vez. Si molesta que queden las keys viejas, un
  `localStorage.removeItem` de cada una en el boot.

### 6. Checklist antes de desplegar

1. Discovery del Histrix del cliente responde y anuncia `S256`.
2. `oauth_clients` tiene `histrix-app` con el `redirect_uri` exacto del host de producción (y los scopes en
   `oauth_scopes`).
3. `CLIENT_ID` / `CLIENT_SECRET` fuera del `.env`, del pipeline y de los secrets del deploy; secret rotado en Histrix.
4. Probar: login → callback → ruta privada; recargar con sesión (no manda al login); `logout()`; dejar vencer el access
   token o forzar un 401 y ver que refresca una sola vez; sesión vencida → `onSessionExpired`.

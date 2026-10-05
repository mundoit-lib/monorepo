# @mundoit-lib/plugin-vue-oidc

Autenticación OIDC para las apps Vue 3 de Mundo IT contra Histrix: authorization code + **PKCE S256**, cliente
público sin secret, refresh token con rotación y renovación automática sin iframe, sobre
[`oidc-client-ts`](https://github.com/authts/oidc-client-ts). Reemplaza al password grant de `plugin-vue-auth`
en las apps que autentican por redirección (app genérica, PWA).

Trae el **núcleo** (`createOidcAuth`), el **http** (`createOidcHttp` / `attachOidcHttp`: Bearer y reintento con
refresh ante 401) y la **capa Vue**: `OidcPlugin` (`$oidc`, `useOidcSession()`), el componente de callback y el
guard de router.

## Instalación

```bash
pnpm add @mundoit-lib/plugin-vue-oidc
```

`oidc-client-ts` viene como dependencia; no hay que instalarlo aparte. Peers: `vue` 3 y `axios` (lo usa
`createOidcHttp`; las apps ya lo tienen). No depende de `vue-router`: el plugin recibe el router de la app y usa
`push`, `replace`, `beforeEach` y `currentRoute`.

## Uso con Vue

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


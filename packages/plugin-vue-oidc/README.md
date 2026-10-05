# @mundoit-lib/plugin-vue-oidc

Autenticación OIDC para las apps Vue 3 de Mundo IT contra Histrix: authorization code + **PKCE S256**, cliente
público sin secret, refresh token con rotación y renovación automática sin iframe, sobre
[`oidc-client-ts`](https://github.com/authts/oidc-client-ts). Reemplaza al password grant de `plugin-vue-auth`
en las apps que autentican por redirección (app genérica, PWA).

Trae el **núcleo** (`createOidcAuth`) y la **capa Vue**: `OidcPlugin` (`$oidc`, `useOidcSession()`), el componente
de callback y el guard de router. El http con Bearer y reintento ante 401 viene en el siguiente release (HD-7683).

## Instalación

```bash
pnpm add @mundoit-lib/plugin-vue-oidc
```

`oidc-client-ts` viene como dependencia; no hay que instalarlo aparte. Peer: `vue` 3. No depende de `vue-router`:
el plugin recibe el router de la app y usa `push`, `replace`, `beforeEach` y `currentRoute`.

## Uso con Vue

```js
import { createOidcAuth, OidcPlugin } from '@mundoit-lib/plugin-vue-oidc';
import HistrixPlugin from '@mundoit-lib/histrix-component-vue/plugin';
import router from './router';

export const auth = createOidcAuth({
  issuer: { host: 'https://cliente.histrix.com.ar', db: 'demo' }, // o la URL del issuer, o nada y setIssuer() después
  clientId: 'histrix-app', // default
  scope: 'openid profile email offline_access', // default
  redirectUri: `${location.origin}/callback`, // default
  postLogoutRedirectUri: `${location.origin}/` // default
});

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
| `loginRoute` / `publicMeta` | Opciones del guard (abajo). |
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
`login()`) con `router.replace`; sin router usa `auth.navigate`. Si algo falla, `status` queda en `'error'` con un
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

Las rutas con `meta[publicMeta]` (en cualquier record de `matched`) y la propia ruta de login pasan. El resto espera
`restoring()` y, sin sesión, devuelve `loginRoute` con `query.redirect = to.fullPath`. `loginRoute` puede ser una
ruta (`'/login'`), un objeto de vue-router (`{ name: 'login' }`, se mezcla la `query`) o una función de la ruta
bloqueada.

### Sesión expirada

`auth.onSessionExpired(cb)` (y la opción `onSessionExpired` del plugin) se dispara cuando una sesión viva vence sin
poder renovarse: el access token expiró y el refresh falló o no había, `restore()` encontró una sesión guardada que
ya no sirve, o `renew()` falló. `logout()` no lo dispara. `isLogged` pasa a `false`; `user` conserva el usuario
persistido hasta el próximo login o logout.

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
| `onSessionExpired(cb)` | La sesión venció sin renovarse (ver arriba); devuelve el unsubscribe. |
| `setIssuer(issuer \| null)` / `getIssuer()` | Multi-tenant: un `UserManager` por issuer; cambiar descarta la sesión y el usuario de la app del anterior. |
| `getUserManager()` | El `UserManager` actual, para usos avanzados. |

`resolveIssuer({ host, db })` y `tenantFromIssuer(url)` convierten entre tenant e issuer con la plantilla
`{host}/api/db/{db}` (`issuerTemplate` la cambia).

Opciones: `storage` (por defecto `localStorage`, para que la PWA sobreviva al cierre del browser), `userKey`,
`userManagerSettings` (pisa los settings de `UserManager` que arma el plugin).

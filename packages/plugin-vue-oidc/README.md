# @mundoit-lib/plugin-vue-oidc

Autenticación OIDC para las apps Vue 3 de Mundo IT contra Histrix: authorization code + **PKCE S256**, cliente
público sin secret, refresh token con rotación y renovación automática sin iframe, sobre
[`oidc-client-ts`](https://github.com/authts/oidc-client-ts). Reemplaza al password grant de `plugin-vue-auth`
en las apps que autentican por redirección (app genérica, PWA).

Este paquete trae el **núcleo** (`createOidcAuth`) y el **http** (`createOidcHttp` / `attachOidcHttp`: Bearer y
reintento con refresh ante 401). El plugin de Vue (`$auth`, `useOidcSession`, componente de callback, guard de
router) viene en el siguiente release (HD-7684).

## Instalación

```bash
pnpm add @mundoit-lib/plugin-vue-oidc
```

`oidc-client-ts` viene como dependencia; no hay que instalarlo aparte. `axios` es peer (lo usa `createOidcHttp`;
las apps ya lo tienen). Vue 3 only.

## Uso

```js
import { createOidcAuth, createOidcHttp } from '@mundoit-lib/plugin-vue-oidc';
import HistrixPlugin from '@mundoit-lib/histrix-component-vue/plugin';

export const auth = createOidcAuth({
  issuer: { host: 'https://cliente.histrix.com.ar', db: 'demo' }, // o la URL del issuer, o nada y setIssuer() después
  clientId: 'histrix-app', // default
  scope: 'openid profile email offline_access', // default
  redirectUri: `${location.origin}/callback`, // default
  postLogoutRedirectUri: `${location.origin}/` // default
});

// axios con Bearer del OIDC y reintento ante 401 (ver "Http").
export const http = createOidcHttp(auth, { baseURL: 'https://cliente.histrix.com.ar/api/db/demo' });

// Cumple el contrato de auth de histrix-component-vue: se pasa directo.
app.use(HistrixPlugin, { auth, http, onUnauthorized: () => router.push({ name: 'login' }) });

// Al arrancar, antes de instalar el router: sesión guardada + refresh si venció.
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
| `setIssuer(issuer \| null)` / `getIssuer()` | Multi-tenant: un `UserManager` por issuer; cambiar descarta la sesión y el usuario de la app del anterior. |
| `getUserManager()` | El `UserManager` actual, para usos avanzados. |

`resolveIssuer({ host, db })` y `tenantFromIssuer(url)` convierten entre tenant e issuer con la plantilla
`{host}/api/db/{db}` (`issuerTemplate` la cambia).

Opciones: `storage` (por defecto `localStorage`, para que la PWA sobreviva al cierre del browser), `userKey`,
`userManagerSettings` (pisa los settings de `UserManager` que arma el plugin).

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

# @mundoit-lib/plugin-vue-oidc

Autenticación OIDC para las apps Vue 3 de Mundo IT contra Histrix: authorization code + **PKCE S256**, cliente
público sin secret, refresh token con rotación y renovación automática sin iframe, sobre
[`oidc-client-ts`](https://github.com/authts/oidc-client-ts). Reemplaza al password grant de `plugin-vue-auth`
en las apps que autentican por redirección (app genérica, PWA).

Este paquete trae el **núcleo** (`createOidcAuth`). El plugin de Vue (`$auth`, `useOidcSession`, componente de
callback, guard de router) y el http con Bearer y reintento ante 401 vienen en los siguientes releases (HD-7684, HD-7683).

## Instalación

```bash
pnpm add @mundoit-lib/plugin-vue-oidc
```

`oidc-client-ts` viene como dependencia; no hay que instalarlo aparte. Vue 3 only.

## Uso

```js
import { createOidcAuth } from '@mundoit-lib/plugin-vue-oidc';
import HistrixPlugin from '@mundoit-lib/histrix-component-vue/plugin';

export const auth = createOidcAuth({
  issuer: { host: 'https://cliente.histrix.com.ar', db: 'demo' }, // o la URL del issuer, o nada y setIssuer() después
  clientId: 'histrix-app', // default
  scope: 'openid profile email offline_access', // default
  redirectUri: `${location.origin}/callback`, // default
  postLogoutRedirectUri: `${location.origin}/` // default
});

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
| `renew()` | Fuerza una renovación con refresh token (p. ej. ante un 401). |
| `logout({ redirect, endSession })` | Borra tokens y usuario local. Si el discovery trae `end_session_endpoint`, redirige ahí; si no, llama a `navigate(redirect)`. |
| `getToken()` / `token()` | Access token vigente o `null`. |
| `user()` / `setUser(u)` | Usuario de la app guardado en `storage` bajo `user` (la key que lee `useHistrixSession`). Sin usuario de la app, `user()` devuelve los claims (`profile`) de la sesión OIDC. |
| `check()` | Hay sesión OIDC con access token sin vencer. |
| `onUserChange(cb)` | Cambios de `user()`; devuelve el unsubscribe. |
| `setIssuer(issuer \| null)` / `getIssuer()` | Multi-tenant: un `UserManager` por issuer; cambiar descarta la sesión del anterior. |
| `getUserManager()` | El `UserManager` actual, para usos avanzados. |

`resolveIssuer({ host, db })` y `tenantFromIssuer(url)` convierten entre tenant e issuer con la plantilla
`{host}/api/db/{db}` (`issuerTemplate` la cambia).

Opciones: `storage` (por defecto `localStorage`, para que la PWA sobreviva al cierre del browser), `userKey`,
`userManagerSettings` (pisa los settings de `UserManager` que arma el plugin).

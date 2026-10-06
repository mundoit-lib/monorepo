# @mundoit-lib/plugin-vue-auth

Autenticación para las apps Vue 3 de Mundo IT: login OAuth (password grant), refresh de token, sesión en storage y
`$auth` / `useAuth()` con la misma superficie que la 1.x.

Desde 2.0 no usa `@websanova/vue-auth` ni `vue-demi`: es un `AuthService` propio con un adaptador Vue 3.

## Instalación

```bash
pnpm add @mundoit-lib/plugin-vue-auth
```

Peer: `vue ^3.3`. Vue 2 ya no está soportado (quedarse en 1.x).

```js
// src/boot/auth.js (Quasar)
import { defineBoot } from '#q-app/wrappers';
import { install as AuthPlugin } from '@mundoit-lib/plugin-vue-auth';
import { getAxiosInstance } from '@mundoit-lib/plugin-vue-axios';

export default defineBoot(({ app, router }) => {
  app.use(AuthPlugin, {
    http: getAxiosInstance(), // con plugin-vue-axios 2.0 el baseURL ya es /api/db/<db> (setDatabase)
    router,
    oauth: { clientId: process.env.CLIENT_ID, clientSecret: process.env.CLIENT_SECRET },
    endpoints: {
      login: '/token', // también se usa para el refresh
      me: '/me',
      logout: null // Histrix no tiene logout OAuth: sólo se limpia la sesión local
    }
  });
});
```

Si la URL de token no sale del baseURL del http, `endpoints.login` acepta una función:
``login: ({ baseURL }) => `${host()}/api/db/${db()}/token` ``.

También acepta la forma de 1.x, `{ plugins: { http, router } }`.

### Opciones

| Opción | Default | Qué hace |
|---|---|---|
| `http` | — (obligatorio) | Instancia de axios (o compatible: el tipo `HttpClient` de `plugin-vue-axios` 2.1, re-exportado acá, invocable como `http(config)`). Se le instalan los interceptores una sola vez. |
| `router` | — | vue-router. Con él, `redirect` en `login`/`logout` hace `router.push` y se activa el guard de `meta.auth`. |
| `authRedirect` | `'/login'` | A dónde manda el guard cuando una ruta con `meta.auth` no tiene sesión. |
| `baseURL` | `''` | Se antepone a los endpoints relativos. Se cambia en runtime con `service.setBaseURL(url)`. |
| `endpoints.login` | `'/oauth/token'` | String o función `({ baseURL }) => url`. |
| `endpoints.refresh` | el de `login` | Endpoint del `refresh_token` grant. |
| `endpoints.me` | `'/me'` | Usuario actual. |
| `endpoints.logout` | `'/logout'` | `null`: no hace request. |
| `oauth` | `{ clientId: '', clientSecret: '', grantType: 'password' }` | Datos del cliente OAuth. |
| `storage` | localStorage | Cualquier `{ get(key), set(key, value), remove(key) }`. |
| `storageKeys` | `accessToken`, `refreshToken`, `tokenExpireDate`, `authTokenUrl` | Son las keys de 1.x y de plugin-vue-axios 1.x: actualizar no cierra sesiones. |
| `refreshBeforeExpiry` | `60` | Segundos antes del vencimiento en que se refresca. |

## Uso

Options API, igual que en 1.x:

```vue
<template>
  <span v-if="$auth.check()">{{ $auth.user().name }}</span>
</template>

<script>
export default {
  methods: {
    salir() {
      this.$auth.logout({ redirect: '/f-login' });
    }
  }
};
</script>
```

Composition API:

```js
import { useAuth } from '@mundoit-lib/plugin-vue-auth';

const auth = useAuth();
await auth.login({ data: { username, password }, redirect: '/' });
auth.isAuthenticated.value; // computed
auth.currentUser.value; // shallowRef
```

`useAuth()` funciona también fuera de un componente (servicios, stores) si el plugin ya está instalado.

### `$auth` / `useAuth()`

| Método | Qué hace |
|---|---|
| `check()` | `true` si hay usuario y token. Reactivo. |
| `user()` / `user('campo')` / `user(obj)` | Devuelve el usuario o un campo, o lo reemplaza. |
| `login({ data, url?, headers?, fetchUser?, redirect? })` | Pide el token y, si no se pasa `fetchUser: false`, el usuario. **Rechaza** si falla. Si `data.grant_type` viene, el body se manda tal cual; si no, se arma con `oauth`. `url` pisa `endpoints.login` para este login y los refresh siguientes. |
| `logout({ redirect?, makeRequest? })` | Llama a `endpoints.logout` (si no es `null`), limpia el storage y navega. |
| `redirect()` | Último destino que bloqueó el guard de `meta.auth`, como `{ from, to }`, o `null`. |
| `ready()` / `load()` | Si terminó (o la promesa de) la restauración de la sesión al arrancar. |
| `token()` | Access token actual. |
| `fetch()` | Vuelve a pedir el usuario. |
| `service` | El `AuthService` (también con `inject('mundoitAuth')`). |

El usuario está tipado como `HistrixUser` (lo que devuelve `GET /me`, de `@mundoit-lib/plugin-vue-axios/http`; también se re-exporta desde acá). Si `/me` trae campos propios, se leen igual (índice abierto) o se tipan con `useAuth<MiUsuario>()` / `new AuthService<MiUsuario>(...)`. Desde 2.1 `user(obj)` pide un `HistrixUser` completo: si la app setea un usuario armado a mano, tiparlo con su propio genérico.

### Refresh

El plugin es el único dueño del refresh:

- Un 401 con refresh token dispara un refresh y reintenta el request original. Los requests concurrentes esperan
  el mismo refresh, así que hay un solo request de token.
- Un timer refresca `refreshBeforeExpiry` segundos antes del vencimiento.
- Al volver la pestaña al frente (`visibilitychange`) se revalida el vencimiento, porque en PWA los timers se suspenden.
- Si el refresh falla, se cierra la sesión local.

**plugin-vue-axios 2.0 ya no refresca tokens.** No combinar auth 2.0 con plugin-vue-axios 1.x ni con su
`legacyRefresh`: los dos interceptores de 401 refrescarían a la vez.

### `AuthService` sin Vue

```ts
import { AuthService } from '@mundoit-lib/plugin-vue-auth';

const auth = new AuthService({ http: axios.create({ baseURL }), endpoints: { me: '/me' } });
await auth.init();
auth.on('auth', (isAuthenticated) => {});
```

Eventos de `on()`: `user`, `auth`, `refresh` y `refreshError`.

## Deprecado (se elimina en 3.0)

Siguen andando en 2.x por compatibilidad con 1.x y se sacan en la 3.0.

| Qué | Reemplazo |
|---|---|
| `setupInterceptors()` | `attach(http)` |
| Forma `{ plugins: { http, router } }` en el `app.use` | `{ http, router }` |

## Migración 1.x → 2.0

Para la app, cambia sólo el `app.use` del boot. Las llamadas a `$auth.*` en las páginas siguen igual.

1. Actualizar a `@mundoit-lib/plugin-vue-auth@^2` y a `@mundoit-lib/plugin-vue-axios@^2`. Sacar `@websanova/vue-auth`
   y `vue-demi` del `package.json` de la app si estaban declarados.
2. En el boot, pasar `http` (o seguir con `plugins.http`) y configurar `oauth` y `endpoints` (`login`, `me`, `logout: null`)
   como en el ejemplo de arriba (en 1.x lo hacían websanova con `fetchData` y el driver). En axios, sacar
   `clientID`, `clientSecret`, `fixURL` y `updateToken`, y no usar `legacyRefresh`.
3. Cambios que pueden notarse:
   - `login()` devuelve la respuesta del token y rechaza si falla. Antes era igual, ahora sin las opciones propias
     de websanova (`rememberMe`, `staySignedIn`, `method` se ignoran).
   - `DriverAuthBearerLaravel` ya no se exporta: no hay drivers.
   - El guard de rutas mira sólo `meta.auth` (cualquier valor distinto de `false`/vacío pide sesión). Los roles no se validan.
   - Vue 2 no está soportado.

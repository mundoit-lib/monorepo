# @mundoit-lib/plugin-vue-axios

Instancia de axios compartida para las apps Vue 3 de Mundo IT y `histrix-component-vue`: headers JSON por defecto,
cambio de base de Histrix en caliente y un hook para errores de infraestructura.

Desde la 2.0 **no maneja el login ni el refresh del token**: eso es de `@mundoit-lib/plugin-vue-auth` 2.0.

## Instalación

```bash
pnpm add @mundoit-lib/plugin-vue-axios axios
```

Peers: `vue ^3.3`, `axios ^1.6`.

## Uso

```js
// boot/axios.js
import { install as axiosPlugin, getAxiosInstance, setDatabase } from '@mundoit-lib/plugin-vue-axios';

app.use(axiosPlugin, {
  baseURL: 'https://histrix.cliente.com/api/db/ventas',
  timeout: 30000,
  headers: { 'X-App': 'ventas-frontend' }, // opcional, se suman a los de por defecto
  onError: (error, context) => notify('Problema de conexión con el servidor')
});

// En cualquier módulo
const { data } = await getAxiosInstance().get('/settings');

// En un componente (Options API)
this.$axios.get('/dir');

// Cambiar de base: reemplaza desde /api en adelante por /api/db/<db>
setDatabase('compras'); // https://histrix.cliente.com/api/db/compras
```

`initializeAxios(config)` hace lo mismo que el plugin sin Vue y devuelve la instancia.

### Config

| Opción | Tipo | Por defecto |
|---|---|---|
| `baseURL` | `string` | obligatoria |
| `headers` | `Record<string, string>` | `Content-Type` y `Accept: application/json` (se pueden pisar) |
| `timeout` | `number` | sin timeout |
| `onError` | `(error, context) => void` o `{ handler, statuses? }` | red y status >= 500 |
| `legacyRefresh` | `{ fixURL, clientID, clientSecret, updateToken? }` | apagado |

`Accept: application/json` va siempre porque algunos endpoints de Histrix (`/dir`, `/settings`,
`/user/notifications/config`) devuelven HTML si no se lo pasa.

### `onError`

Es para errores de infraestructura, no de negocio: por defecto se dispara con errores de red y con status >= 500. Un 400
de validación o un 401 no lo disparan, y un request cancelado tampoco.

```js
onError: {
  handler: (error, { kind, status, config }) => { /* kind: 'network' | 'http' | 'refresh' */ },
  statuses: [500, 502, 503, 504, 409] // reemplaza al default; los errores de red disparan siempre
}
```

### API

| Export | Qué hace |
|---|---|
| `install(app, config)` | Plugin de Vue 3: inicializa y expone `$axios` (tipado vía `ComponentCustomProperties`) |
| `initializeAxios(config)` | Crea (o reemplaza) la instancia compartida y la devuelve |
| `getAxiosInstance()` | Devuelve la instancia; tira si no se inicializó |
| `setBaseURL(url)` | Cambia la base de los requests siguientes |
| `setDatabase(db)` | `setBaseURL` con `<host>/api/db/<db>` |
| `axiosInstance` | **Deprecado, se elimina en 3.0**: es `undefined` hasta `initializeAxios`. Usar `getAxiosInstance()` |
| `HttpClient` (tipo) | Contrato `get/post/put/patch/delete` + `interceptors`, invocable como `http(config)` (2.1+), que usan auth y `histrix-component-vue`. Una instancia de axios lo cumple sin adaptador. También en `@mundoit-lib/plugin-vue-axios/http` (sólo tipos, sin axios ni `$axios`) junto con `HttpRequestConfig`, `HttpResponse` y `HttpInterceptorManager` |
| `HistrixUser` (tipo, 2.2+) | Usuario que devuelve `GET /me` de Histrix (`id`, `username`, `email`, `roles`, `fullname`, `name`…), con índice abierto para los campos extra de cada instalación. Desde 2.3 trae también los datos de arranque de la SPA que suma Histrix 2.0: `admin`, `perfil`/`perfiles`, `avatar`, `interno`, `theme`, `rhpersonal_id`, `lang`, `version`, `database` (`id`, `descripcion`, `baseModule`), `empresa` (`nombre`, `cuit`, `iibb`, `direccion`…), `ui` (`logo`, `fondo`, `modulos`), `plugins` y `capabilities` (`systemMenu`, `editor`). Los bloques se exportan como `HistrixPerfil`, `HistrixVersion`, `HistrixDatabase`, `HistrixEmpresa`, `HistrixUi` y `HistrixCapabilities`. Es el usuario por defecto de `plugin-vue-auth` 2.1+ y `plugin-vue-oidc` 1.1+. También en `./http` |

## Deprecado (se elimina en 3.0)

Siguen andando en 2.x por compatibilidad con 1.x y se sacan en la 3.0.

| Qué | Reemplazo |
|---|---|
| `legacyRefresh` (y el warning por `db`, `clientID`, `clientSecret`, `fixURL`, `updateToken`) | El refresh de `plugin-vue-auth` 2.0 |
| `axiosInstance` | `getAxiosInstance()` |

`legacyRefresh` es el único con lógica: se saca recién cuando ninguna app quede en `plugin-vue-auth` 1.x.

## Guía 1.x → 2.0

1. **El refresh pasa a auth.** Con `plugin-vue-auth` 2.0, sacá de la config de axios `db`, `clientID`, `clientSecret`,
   `fixURL` y `updateToken`; auth se encarga del Bearer, del 401 → refresh y del reintento.
2. **Si todavía usás auth 1.x**, mové esas claves a `legacyRefresh` y se comporta como la 1.0.9:

   ```js
   app.use(axiosPlugin, {
     baseURL,
     legacyRefresh: { fixURL, clientID, clientSecret, updateToken }
   });
   ```

   No lo uses junto con auth 2.0: habría dos refresh compitiendo. Si pasás esas claves sueltas sin `legacyRefresh`, la
   librería avisa por consola y las ignora.
3. **`db` ya no se pasa en la config**: poné la base completa en `baseURL` o usá `setDatabase(db)`.
4. **`onError` cambia**: ahora recibe `(error, context)` y no se dispara con cualquier error, sólo con red y 5xx (ver
   arriba). Si la app lo usaba para desloguear ante un refresh fallido, con `legacyRefresh` sigue llegando con
   `kind: 'refresh'`.
5. **Vue 3 only**: se sacó el soporte Vue 2 (`Vue.prototype.$axios`).
6. **`axiosInstance`** sigue exportado pero deprecated; pasá a `getAxiosInstance()`.

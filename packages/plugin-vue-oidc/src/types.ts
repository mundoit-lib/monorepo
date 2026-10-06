import type { User, UserManager, UserManagerSettings } from 'oidc-client-ts';
import type { HistrixUser } from '@mundoit-lib/plugin-vue-axios/http';
import type { ComputedRef, ShallowRef } from 'vue';
import type { OidcIssuer } from './issuer';

/** Sesión OIDC (tokens + claims) tal como la guarda `oidc-client-ts`. */
export type OidcUser = User;
/** Usuario de `GET /me` de Histrix: el usuario por defecto de `user()`. */
export type { HistrixUser };

/** Storage sincrónico tipo `localStorage`: tokens de oidc-client-ts y usuario de la app. */
export type OidcStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export interface OidcAuthOptions {
  /**
   * Issuer inicial. Puede faltar y fijarse después con `setIssuer()` (multi-tenant: la app resuelve
   * el tenant por código, link o hostname y recién ahí sabe contra qué Histrix autenticar).
   */
  issuer?: OidcIssuer | null;
  /** Plantilla para armar el issuer a partir de `{ host, db }`. Por defecto `{host}/api/db/{db}`. */
  issuerTemplate?: string;
  /** Cliente público (sin secret) registrado en Histrix. Por defecto `histrix-app`. */
  clientId?: string;
  /** Por defecto `openid profile email offline_access` (`offline_access` pide refresh token). */
  scope?: string;
  /** A dónde vuelve el authorize. Por defecto `${location.origin}/callback`. */
  redirectUri?: string;
  /** A dónde vuelve el `end_session`, si el issuer lo tiene. Por defecto `${location.origin}/`. */
  postLogoutRedirectUri?: string;
  /** Dónde viven los tokens y el usuario de la app. Por defecto `localStorage` (la PWA sobrevive al cierre). */
  storage?: OidcStorage;
  /** Key del usuario de la app en `storage`. Por defecto `user` (la que lee `useHistrixSession`). */
  userKey?: string;
  /** Ajustes extra de `UserManager` que pisan los que arma el plugin (escape hatch). */
  userManagerSettings?: Partial<UserManagerSettings>;
}

export interface OidcLoginOptions {
  /** Ruta de la app a la que volver después del callback. Viaja en `state`. Por defecto `/`. */
  redirect?: string;
}

/**
 * Lo que mandan las pantallas de login de `histrix-component-vue` (`HistrixLoginCredentials`). Usuario, contraseña
 * y `request` se ignoran: con OIDC, login = redirigir al authorize. Un `redirect` que no sea string cuenta como `/`.
 */
export interface OidcLoginCredentials {
  username?: unknown;
  password?: unknown;
  request?: unknown;
  redirect?: unknown;
}

export interface OidcLogoutOptions {
  /** A dónde ir tras el logout local (se pasa a `navigate`). Con `end_session` se usa `postLogoutRedirectUri`. */
  redirect?: string | null;
  /** `false`: no redirigir al `end_session_endpoint` aunque el issuer lo anuncie. Por defecto, se usa si existe. */
  endSession?: boolean;
  [key: string]: unknown;
}

export interface OidcCallbackResult {
  user: OidcUser;
  /** El `redirect` que se pasó a `login()`, o `/`. */
  redirect: string;
}

/**
 * Contrato de auth de `histrix-component-vue` (`types/integration.d.ts`, `HistrixAuth`).
 * Se copia acá para que el test de tipos lo valide sin depender de la librería.
 */
export interface HistrixAuthContract<TUser = HistrixUser> {
  login(credentials: { username: string; password: string; request?: unknown; redirect?: unknown }): Promise<unknown>;
  logout(options?: { redirect?: unknown }): unknown;
  user(): TUser | null;
  setUser(user: TUser | null): void;
  getToken(): string | null;
  check(): boolean;
  onUserChange(cb: (user: TUser | null) => void): () => void;
}

export interface OidcAuth<TUser = HistrixUser> extends HistrixAuthContract<TUser> {
  /**
   * Marca de `createAuthAdapter` de histrix-component-vue: `adaptAuth` lo usa tal cual, sin envolverlo.
   * Sin la marca, al tener `token()` y `onUserChange` lo tomaría por un `AuthService` y le pisaría `onUserChange`.
   */
  readonly __histrixAuth: true;
  /** Redirige al authorize del issuer. La promesa no resuelve: la página navega. */
  login(options?: OidcLoginOptions | OidcLoginCredentials): Promise<never>;
  /** Procesa la vuelta del authorize (`/callback`): canjea el code, guarda la sesión y devuelve a dónde ir. */
  handleCallback(url?: string): Promise<OidcCallbackResult>;
  /** Al arrancar: carga la sesión guardada y la renueva con refresh token si venció. `null` sin sesión. */
  restore(): Promise<OidcUser | null>;
  /** Fuerza una renovación con refresh token (p. ej. ante un 401). */
  renew(): Promise<OidcUser | null>;
  /** Borra la sesión local y el usuario de la app; si el issuer anuncia `end_session_endpoint`, redirige ahí. */
  logout(options?: OidcLogoutOptions): Promise<void>;
  /** Access token vigente, o `null`. */
  getToken(): string | null;
  /** Alias de `getToken()`, forma del `AuthService` de plugin-vue-auth 2.x. */
  token(): string | null;
  /** Usuario de la app (`setUser`) o, si no hay, los claims (`profile`) de la sesión OIDC. */
  user(): TUser | null;
  setUser(user: TUser | null): void;
  /** Hay sesión OIDC con access token sin vencer. */
  check(): boolean;
  /** Se dispara cuando cambia `user()`; devuelve el unsubscribe. */
  onUserChange(cb: (user: TUser | null) => void): () => void;
  /**
   * Se dispara cuando una sesión viva vence sin poder renovarse: el access token expiró y el refresh falló o no
   * había, `restore()` encontró una sesión guardada que ya no sirve, o `renew()` falló. `logout()` no lo dispara.
   * Devuelve el unsubscribe.
   */
  onSessionExpired(cb: () => void): () => void;
  /** Cambia de issuer en runtime (multi-tenant): un `UserManager` por issuer, la sesión del anterior se descarta. */
  setIssuer(issuer: OidcIssuer | null): void;
  /** Issuer actual resuelto, o `null`. */
  getIssuer(): string | null;
  /** `UserManager` del issuer actual (para usos avanzados), o `null`. */
  getUserManager(): UserManager | null;
  /** Cómo navegar en `logout({ redirect })`. Por defecto `window.location.href`; el plugin Vue lo cambia por el router. */
  navigate: (target: string) => void;
}

// ---------------------------------------------------------------------------------------------------------------------
// Capa Vue. Los tipos del router son estructurales (lo que usa el plugin de vue-router 4), sin depender del paquete.
// ---------------------------------------------------------------------------------------------------------------------

/** Lo que el guard mira de una ruta de vue-router (`RouteLocationNormalized`). */
export interface RouteLike {
  path: string;
  fullPath: string;
  name?: unknown;
  query?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  matched?: Array<{ meta?: Record<string, unknown> }>;
}

/** Destino de navegación: ruta (`'/login'`) u objeto de vue-router (`{ name: 'login' }`). */
export type RouteTarget =
  | string
  | { path?: string; name?: unknown; query?: Record<string, unknown>; [key: string]: unknown };

/** Lo que usa el plugin de vue-router 4 (sin depender del paquete). */
export interface RouterLike {
  push(to: RouteTarget): unknown;
  replace(to: RouteTarget): unknown;
  beforeEach(guard: (to: RouteLike, from: RouteLike) => unknown): unknown;
  currentRoute?: { value: RouteLike };
}

export interface OidcGuardOptions {
  /**
   * A dónde manda sin sesión, con `query.redirect = to.fullPath`. Ruta, objeto de vue-router o función de la ruta
   * bloqueada. Por defecto `/login`. Si es ruta u objeto con `name`, esa ruta se trata como pública (sin loop).
   */
  loginRoute?: RouteTarget | ((to: RouteLike) => RouteTarget);
  /** Key de `meta` que marca una ruta como pública (no pide sesión). Por defecto `public`. */
  publicMeta?: string;
  /**
   * Ruta de la vuelta del authorize, que pasa siempre (todavía no hay sesión y el guard la mandaría al login
   * perdiendo el code). Por defecto, el path del `redirectUri` del `UserManager` actual (`/callback`).
   * `false` para no eximir ninguna (la app la marca con `meta[publicMeta]`).
   */
  callbackRoute?: string | false;
}

export interface OidcPluginOptions extends OidcGuardOptions {
  /** El núcleo (`createOidcAuth`), el mismo que se le pasa a histrix-component-vue. */
  auth: OidcAuth<any>;
  /** Con router: `logout({ redirect })` navega con `router.push` y se instala el guard (salvo `guard: false`). */
  router?: RouterLike;
  /** `false`: no instalar `createOidcGuard` en `router.beforeEach` (la app arma el suyo). Por defecto `true`. */
  guard?: boolean;
  /**
   * `false`: no llamar a `restore()` al instalar. Para multi-tenant sin issuer al arrancar: la app llama a
   * `oidc.restore()` después de `auth.setIssuer()`. Por defecto `true`.
   */
  restore?: boolean;
  /** Se llama cuando la sesión vence sin renovarse (`auth.onSessionExpired`): para avisar y mandar al login. */
  onSessionExpired?: () => void;
  /** Nombre de la propiedad global (`this.$oidc`). `false` para no registrarla. Por defecto `$oidc`. */
  globalProperty?: string | false;
}

/** Opciones de `login()` desde Vue: igual que `OidcLoginOptions`; sin `redirect`, toma `?redirect=` de la ruta actual. */
export type VueOidcLoginOptions = OidcLoginOptions | OidcLoginCredentials;

/**
 * `$oidc` / `useOidc()` / `useOidcSession()`: el núcleo con estado reactivo. Misma forma que `useHistrixSession`
 * de histrix-component-vue (`user`, `isLogged`, `login`, `logout`), así la app tiene una sola fuente de verdad.
 */
export interface VueOidc<TUser = HistrixUser> {
  /** El núcleo (`createOidcAuth`). */
  readonly auth: OidcAuth<TUser>;
  /** `auth.user()`: usuario de la app o claims de la sesión. Reactivo. */
  readonly user: ShallowRef<TUser | null>;
  /** `auth.check()`: hay sesión OIDC con access token vigente. Reactivo. */
  readonly isLogged: ComputedRef<boolean>;
  /** `true` cuando terminó el `restore()` inicial (o nunca se pidió). Reactivo. */
  readonly ready: ShallowRef<boolean>;
  /** Redirige al authorize. Sin `redirect`, usa `?redirect=` de la ruta actual si es una ruta de la app. */
  login(options?: VueOidcLoginOptions): Promise<never>;
  logout(options?: OidcLogoutOptions): Promise<void>;
  /** Renovación con refresh token (p. ej. ante un 401). */
  renew(): Promise<OidcUser | null>;
  /** Carga la sesión guardada. El guard espera la última llamada antes de decidir la navegación inicial. */
  restore(): Promise<OidcUser | null>;
  /** Promesa del último `restore()` (resuelta si no hubo ninguno): lo que espera el guard. */
  restoring(): Promise<unknown>;
  /** Procesa `/callback`: canjea el code y actualiza el estado. Lo usa `useOidcCallback`. */
  handleCallback(url?: string): Promise<OidcCallbackResult>;
}

export type OidcCallbackStatus = 'pending' | 'done' | 'error';

export interface OidcCallbackOptions<TUser = HistrixUser> {
  /** URL a procesar. Por defecto `window.location.href`. */
  url?: string;
  /**
   * Después de canjear el code y antes de navegar. La app genérica hace acá `session.refresh()` para traer `/me`.
   * Si rechaza, el callback queda en error (la sesión OIDC ya está guardada).
   */
  onLogin?: (user: OidcUser, oidc: VueOidc<TUser>) => unknown | Promise<unknown>;
  onError?: (error: unknown) => void;
  /** Pisa el `redirect` que vino en `state`. */
  redirect?: string;
  /** `false`: no arrancar en `onMounted`; la app llama a `run()`. Por defecto `true`. */
  immediate?: boolean;
}

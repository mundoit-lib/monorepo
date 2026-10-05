import type { User, UserManager, UserManagerSettings } from 'oidc-client-ts';
import type { OidcIssuer } from './issuer';

/** Sesión OIDC (tokens + claims) tal como la guarda `oidc-client-ts`. */
export type OidcUser = User;

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
export interface HistrixAuthContract<TUser = Record<string, unknown>> {
  login(credentials: { username: string; password: string; request?: unknown; redirect?: unknown }): Promise<unknown>;
  logout(options?: { redirect?: unknown }): unknown;
  user(): TUser | null;
  setUser(user: TUser | null): void;
  getToken(): string | null;
  check(): boolean;
  onUserChange(cb: (user: TUser | null) => void): () => void;
}

export interface OidcAuth<TUser = Record<string, unknown>> extends HistrixAuthContract<TUser> {
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
  /** Cambia de issuer en runtime (multi-tenant): un `UserManager` por issuer, la sesión del anterior se descarta. */
  setIssuer(issuer: OidcIssuer | null): void;
  /** Issuer actual resuelto, o `null`. */
  getIssuer(): string | null;
  /** `UserManager` del issuer actual (para usos avanzados), o `null`. */
  getUserManager(): UserManager | null;
  /** Cómo navegar en `logout({ redirect })`. Por defecto `window.location.href`; el plugin Vue lo cambia por el router. */
  navigate: (target: string) => void;
}

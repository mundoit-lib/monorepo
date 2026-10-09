import type { HttpRequestConfig as BaseHttpRequestConfig } from '@mundoit-lib/plugin-vue-axios/http';

/** Datos que recibe un endpoint definido como función. */
export interface EndpointContext {
  /** Base fijada con `config.baseURL` o `service.setBaseURL()`; '' si no hay. */
  baseURL: string;
}

/**
 * Un endpoint puede ser fijo o calcularse en cada request
 * (en Histrix la base cambia en runtime: `/api/db/{db}/token`).
 */
export type Endpoint = string | ((ctx: EndpointContext) => string);

/** Storage de tokens. Por defecto, localStorage. */
export interface AuthStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface AuthConfig {
  /** Se antepone a los endpoints relativos. Vacío: los resuelve el http (p. ej. el baseURL de axios). */
  baseURL: string;
  endpoints: {
    /** Token por password grant. */
    login: Endpoint;
    /** Token por refresh_token. Por defecto, el mismo que `login`. */
    refresh?: Endpoint;
    register: Endpoint;
    me: Endpoint;
    /** `null`: el logout es sólo local, sin request (Histrix no tiene logout OAuth). */
    logout: Endpoint | null;
  };
  oauth: {
    clientId: string;
    clientSecret: string;
    grantType: string;
  };
  storage: AuthStorage;
  /** Keys compatibles con 1.x y con plugin-vue-axios 1.x, para que actualizar no cierre sesiones. */
  storageKeys: {
    accessToken: string;
    refreshToken: string;
    /** Vencimiento en ms desde epoch. */
    expiresAt: string;
    /** URL de token usada en el último `login({ url })`, para refrescar contra la misma. */
    tokenUrl: string;
  };
  socialProviders: Record<string, SocialProviderConfig>;
  /** Segundos antes del vencimiento en los que se refresca el token. */
  refreshBeforeExpiry: number;
}

export interface AuthOptions extends Partial<Omit<AuthConfig, 'endpoints' | 'oauth' | 'storageKeys'>> {
  endpoints?: Partial<AuthConfig['endpoints']>;
  oauth?: Partial<AuthConfig['oauth']>;
  storageKeys?: Partial<AuthConfig['storageKeys']>;
}

export interface SocialProviderConfig {
  clientId: string;
  authUrl: string;
  redirectUri: string;
  scope?: string;
  callbackEndpoint?: string;
}

export interface LoginCredentials {
  email?: string;
  username?: string;
  password?: string;
  /** Si viene, el body se manda tal cual (forma 1.x: `{ username, password, grant_type, client_id, ... }`). */
  grant_type?: string;
  [key: string]: unknown;
}

export interface LoginOptions {
  data: LoginCredentials;
  /** Pisa `endpoints.login` para este login y para los refresh siguientes. */
  url?: string;
  headers?: Record<string, string>;
  /** `false`: no pide `/me` (la app setea el usuario con `user(obj)`). Por defecto, true. */
  fetchUser?: boolean;
  redirect?: RedirectTarget;
  [key: string]: unknown;
}

export interface LogoutOptions {
  redirect?: RedirectTarget;
  /** `false`: no llama a `endpoints.logout` aunque esté configurado. */
  makeRequest?: boolean;
  [key: string]: unknown;
}

/** Ruta a la que ir: path o lo que acepte `router.push`. */
export type RedirectTarget = string | Record<string, unknown> | null | undefined;

export interface RegisterData {
  email: string;
  password: string;
  name?: string;
  [key: string]: unknown;
}

export interface AuthResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: unknown;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

/** Config de request que ven los interceptores de auth: el de plugin-vue-axios más las marcas internas del reintento. */
export interface HttpRequestConfig extends BaseHttpRequestConfig {
  url?: string;
  headers?: Record<string, string>;
  /** Puesta por el interceptor de respuesta: el request ya se reintentó tras un refresh. */
  _retry?: boolean;
  /** Puesta por el servicio en sus propios requests (login, refresh): sin Bearer y sin reintento. */
  _skipAuth?: boolean;
}

/**
 * El cliente http es el `HttpClient` de `@mundoit-lib/plugin-vue-axios/http` (2.1+, invocable como `http(config)`
 * para reintentar el request original después del refresh). Una instancia de axios lo cumple sin adaptador.
 * Se re-exporta por compatibilidad. Sólo tipos, inlineados en el `.d.ts`: auth no depende de plugin-vue-axios
 * ni de axios, ni en runtime ni en tipos.
 */
export type {
  HistrixCapabilities,
  HistrixDatabase,
  HistrixEmpresa,
  HistrixPerfil,
  HistrixUi,
  HistrixUser,
  HistrixVersion,
  HttpClient,
  HttpResponse
} from '@mundoit-lib/plugin-vue-axios/http';

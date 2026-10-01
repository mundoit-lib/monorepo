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

export interface HttpRequestConfig {
  url?: string;
  headers?: Record<string, string>;
  _retry?: boolean;
  [key: string]: any;
}

/**
 * Lo que necesita el servicio del cliente http (compatible con una instancia de axios).
 * Nota: cuando se publique plugin-vue-axios 2.0, importar el tipo desde ahí.
 */
export interface HttpClient {
  get<T = unknown>(url: string, config?: any): Promise<{ data: T }>;
  post<T = unknown>(url: string, data?: unknown, config?: any): Promise<{ data: T }>;
  interceptors: {
    request: {
      use: (onFulfilled: (config: any) => any, onRejected?: (error: any) => any) => unknown;
    };
    response: {
      use: (onFulfilled: (response: any) => any, onRejected?: (error: any) => any) => unknown;
    };
  };
  (config: any): Promise<any>;
}

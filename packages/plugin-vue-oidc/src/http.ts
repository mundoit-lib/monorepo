import axios, { type AxiosInstance, type CreateAxiosDefaults } from 'axios';
import type { HttpClient, HttpRequestConfig } from '@mundoit-lib/plugin-vue-axios/http';
import type { OidcAuth } from './types';

/** Lo que el http necesita del auth: el access token vigente y cómo renovarlo. `createOidcAuth()` lo cumple. */
export type OidcAuthLike = Pick<OidcAuth<unknown>, 'getToken' | 'renew'>;

/** Config de request que ven los interceptores: el de plugin-vue-axios más la marca del reintento. */
export interface OidcHttpRequestConfig extends HttpRequestConfig {
  headers?: Record<string, any>;
  /**
   * Puesta por el interceptor de respuesta: el request ya se reintentó tras un refresh. Es la misma marca que usa
   * plugin-vue-auth, así si una app attachea los dos por error reintenta uno solo.
   */
  _retry?: boolean;
}

type Detach = () => void;

/** Un attach por instancia: el segundo devuelve el detach del primero, sin duplicar el Bearer ni el reintento. */
const attached = new WeakMap<HttpClient, Detach>();

const setBearer = (config: OidcHttpRequestConfig, token: string): void => {
  config.headers = config.headers ?? {};
  config.headers.Authorization = `Bearer ${token}`;
};

/**
 * Instala en `http` (una instancia de axios o cualquier `HttpClient` de plugin-vue-axios 2.1+) el Bearer del OIDC y
 * un reintento con refresh ante 401. Con plugin-vue-axios 2.0: `attachOidcHttp(getAxiosInstance(), auth)`, sin
 * `legacyRefresh`: plugin-vue-oidc es el único dueño del refresh.
 *
 * - Request: `Authorization: Bearer <access token vigente>`; sin token no toca los headers. Nunca agrega
 *   `client_id`/`client_secret` (cliente público).
 * - Response 401 (una vez por request): `auth.renew()` y se repite el pedido con el token nuevo. Si el refresh falla
 *   o no deja sesión, se propaga el 401 original: la app decide (`onUnauthorized` de histrix-component-vue).
 *   `renew()` comparte una sola renovación en vuelo, así varios 401 simultáneos gastan un solo refresh token.
 *
 * Devuelve el detach, que saca los dos interceptores.
 */
export function attachOidcHttp(http: HttpClient, auth: OidcAuthLike): Detach {
  const existing = attached.get(http);
  if (existing) return existing;

  const requestId = http.interceptors.request.use((config: OidcHttpRequestConfig) => {
    const token = auth.getToken();
    if (token) setBearer(config, token);
    return config;
  });

  const responseId = http.interceptors.response.use(undefined, async (error) => {
    const request: OidcHttpRequestConfig | undefined = error?.config;
    if (error?.response?.status !== 401 || !request || request._retry) throw error;

    request._retry = true;
    const user = await auth.renew().catch(() => null);
    if (!user) throw error;
    setBearer(request, user.access_token);
    return http(request);
  });

  const detach: Detach = () => {
    http.interceptors.request.eject(requestId);
    http.interceptors.response.eject(responseId);
    attached.delete(http);
  };
  attached.set(http, detach);
  return detach;
}

/** `axios.create(config)` ya attacheado con `attachOidcHttp`. Reemplaza al `http.js` de la app genérica. */
export function createOidcHttp(auth: OidcAuthLike, config?: CreateAxiosDefaults): AxiosInstance {
  const http = axios.create(config);
  attachOidcHttp(http, auth);
  return http;
}

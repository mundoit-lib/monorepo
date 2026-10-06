// Contrato HTTP compartido. Sin imports: se publica también como `@mundoit-lib/plugin-vue-axios/http`
// (sólo tipos) para que `plugin-vue-auth` e `histrix-component-vue` lo tomen sin arrastrar axios ni la
// augmentación de `$axios` en Vue.

/** Respuesta mínima que necesitan los consumidores de `HttpClient`. */
export interface HttpResponse<T = any> {
  data: T;
  status: number;
  headers: Record<string, any>;
}

/** Opciones de request que entiende cualquier `HttpClient`. */
export interface HttpRequestConfig {
  headers?: Record<string, any>;
  params?: any;
  timeout?: number;
  signal?: AbortSignal;
  [key: string]: any;
}

export interface HttpInterceptorManager<V> {
  use(onFulfilled?: ((value: V) => V | Promise<V>) | null, onRejected?: ((error: any) => any) | null): number;
  eject(id: number): void;
}

/**
 * Contrato HTTP que usan `plugin-vue-auth` y `histrix-component-vue`.
 * Una instancia de axios lo cumple sin adaptador.
 *
 * Además de `get/post/...` es invocable con un config completo (`http({ url, method, ... })`),
 * como axios: así `plugin-vue-auth` reintenta el request original (`error.config`) después del refresh.
 */
export interface HttpClient {
  (config: HttpRequestConfig): Promise<HttpResponse>;
  get<T = any>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
  delete<T = any>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
  post<T = any>(url: string, data?: any, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
  put<T = any>(url: string, data?: any, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
  patch<T = any>(url: string, data?: any, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
  interceptors: {
    request: HttpInterceptorManager<any>;
    response: HttpInterceptorManager<HttpResponse>;
  };
}

/**
 * Usuario que devuelve `GET /me` de Histrix. Estos campos vienen siempre; según la instalación puede traer
 * más, por eso el índice abierto. Lo usan `plugin-vue-auth` y `plugin-vue-oidc` como usuario por defecto.
 */
export interface HistrixUser {
  id: number;
  user_id: number;
  username: string;
  email: string;
  /** Ids de rol, como strings (`["1"]`). */
  roles: string[];
  fullname: string;
  first_name: string;
  last_name: string;
  occupation: string | null;
  companyName: string | null;
  phone: string | null;
  verified: boolean | number | string | null;
  name: string;
  emailVerified: boolean;
  /** Último acceso, `YYYY-MM-DD HH:mm:ss`. */
  last_log: string | null;
  socialNetworks: {
    linkedIn?: string;
    facebook?: string;
    twitter?: string;
    instagram?: string;
    [network: string]: string | undefined;
  };
  [key: string]: unknown;
}

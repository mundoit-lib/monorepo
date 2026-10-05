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

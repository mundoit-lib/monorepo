import type { AxiosRequestConfig } from 'axios';

export interface ErrorContext {
  /** `network`: sin respuesta; `http`: respuesta con status de error; `refresh`: falló el refresh legacy. */
  kind: 'network' | 'http' | 'refresh';
  status?: number;
  config?: AxiosRequestConfig;
}

export type ErrorHandler = (error: unknown, context: ErrorContext) => void;

export interface ErrorOptions {
  handler: ErrorHandler;
  /** Statuses HTTP que disparan el handler. Por defecto, todos los >= 500. Los errores de red siempre lo disparan. */
  statuses?: number[];
}

/** Refresh 401 de la 1.x. Sólo para apps que todavía usan `plugin-vue-auth` 1.x; con auth 2.0 no se usa. */
export interface LegacyRefreshConfig {
  fixURL: string;
  clientID: string;
  clientSecret: string;
  updateToken?: (token: any) => void;
}

export interface AxiosConfig {
  baseURL: string;
  /** Se suman a `Content-Type` y `Accept: application/json` (y los pueden pisar). */
  headers?: Record<string, string>;
  timeout?: number;
  onError?: ErrorHandler | ErrorOptions;
  /**
   * Apagado por defecto.
   * @deprecated Se elimina en 3.0. Usar el refresh de `plugin-vue-auth` 2.0. La 3.0 sale cuando ninguna app quede en auth 1.x.
   */
  legacyRefresh?: LegacyRefreshConfig;
}

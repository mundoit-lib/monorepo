import axios, { type AxiosInstance } from 'axios';
import { installLegacyRefresh } from './legacyRefresh';
import type { AxiosConfig, ErrorContext, ErrorHandler } from './types';

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json'
};

// Claves de la config 1.x que en 2.0 sólo tienen efecto dentro de `legacyRefresh`.
const LEGACY_KEYS = ['db', 'clientID', 'clientSecret', 'fixURL', 'updateToken'];

/**
 * @deprecated Se elimina en 3.0. Usar `getAxiosInstance()`. Es `undefined` hasta que se llama a `initializeAxios`.
 */
export let axiosInstance: AxiosInstance;

export const getAxiosInstance = (): AxiosInstance => {
  if (!axiosInstance) {
    throw new Error('Axios instance is not initialized');
  }
  return axiosInstance;
};

export const initializeAxios = (config: AxiosConfig): AxiosInstance => {
  validateAxiosConfig(config);
  warnLegacyConfig(config);

  const instance = axios.create({
    baseURL: config.baseURL,
    timeout: config.timeout,
    headers: { ...DEFAULT_HEADERS, ...config.headers }
  });

  const { handler, statuses } =
    typeof config.onError === 'function' ? { handler: config.onError, statuses: undefined } : (config.onError ?? {});
  const notify: ErrorHandler = (error, context) => handler?.(error, context);

  instance.interceptors.response.use(undefined, (error) => {
    const context = errorContext(error);
    if (context && shouldNotify(context, statuses)) {
      notify(error, context);
    }
    return Promise.reject(error);
  });

  if (config.legacyRefresh) {
    installLegacyRefresh(instance, config.legacyRefresh, notify);
  }

  axiosInstance = instance;
  return instance;
};

export const setBaseURL = (url: string) => {
  getAxiosInstance().defaults.baseURL = url;
};

/** Apunta la instancia a otra base de Histrix: reemplaza desde `/api` en adelante por `/api/db/<db>`. */
export const setDatabase = (db: string) => {
  const host = (getAxiosInstance().defaults.baseURL ?? '').replace(/\/api(\/.*)?$/, '').replace(/\/+$/, '');
  setBaseURL(`${host}/api/db/${encodeURIComponent(db)}`);
};

const errorContext = (error: unknown): ErrorContext | undefined => {
  if (axios.isCancel(error)) return undefined;
  if (!axios.isAxiosError(error) || !error.response) {
    return { kind: 'network', config: axios.isAxiosError(error) ? error.config : undefined };
  }
  return { kind: 'http', status: error.response.status, config: error.config };
};

const shouldNotify = (context: ErrorContext, statuses?: number[]) => {
  if (context.kind !== 'http' || context.status === undefined) return true;
  return statuses ? statuses.includes(context.status) : context.status >= 500;
};

const validateAxiosConfig = (config: Partial<AxiosConfig>) => {
  if (typeof config.baseURL !== 'string' || !config.baseURL) {
    throw new Error('Invalid or missing config property: baseURL');
  }
};

const warnLegacyConfig = (config: AxiosConfig) => {
  if (config.legacyRefresh) return;
  const found = LEGACY_KEYS.filter((key) => key in config);
  if (found.length === 0) return;
  console.warn(
    `[plugin-vue-axios] 2.0 ya no refresca el token y ignora ${found.join(', ')}. El refresh lo hace plugin-vue-auth 2.0; si seguís con auth 1.x, pasá { legacyRefresh: { fixURL, clientID, clientSecret, updateToken } } (se elimina en 3.0). Para la base, usá setDatabase(db).`
  );
};

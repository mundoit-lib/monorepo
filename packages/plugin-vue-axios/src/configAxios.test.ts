import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'vue';
import { axiosInstance, getAxiosInstance, initializeAxios, setBaseURL, setDatabase } from './configAxios';
import { install } from './index';
import type { HttpClient } from './types';

type Reply = { status: number; data?: unknown } | 'network';

const BASE = 'https://histrix.test/api/db/demo';

let reply: (config: InternalAxiosRequestConfig) => Reply;
const calls: InternalAxiosRequestConfig[] = [];

const adapter: AxiosAdapter = async (config) => {
  calls.push(config);
  const result = reply(config);
  if (result === 'network') {
    throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config);
  }
  const response = { data: result.data ?? {}, status: result.status, statusText: '', headers: {}, config, request: {} };
  if (result.status >= 200 && result.status < 300) return response;
  throw new AxiosError(
    `Request failed with status code ${result.status}`,
    AxiosError.ERR_BAD_RESPONSE,
    config,
    {},
    response
  );
};

const fullURL = (config: InternalAxiosRequestConfig) => `${config.baseURL ?? ''}${config.url ?? ''}`;

const createStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key)
  };
};

const originalAdapter = axios.defaults.adapter;

beforeEach(() => {
  calls.length = 0;
  reply = () => ({ status: 200 });
  axios.defaults.adapter = adapter;
  vi.stubGlobal('localStorage', createStorage());
});

afterEach(() => {
  axios.defaults.adapter = originalAdapter;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('initializeAxios', () => {
  it('getAxiosInstance tira si no se inicializó', async () => {
    vi.resetModules();
    const fresh = await import('./configAxios');
    expect(fresh.axiosInstance).toBeUndefined();
    expect(() => fresh.getAxiosInstance()).toThrow('Axios instance is not initialized');
  });

  it('exige baseURL y nada más', () => {
    expect(() => initializeAxios({} as any)).toThrow('baseURL');
    expect(() => initializeAxios({ baseURL: BASE })).not.toThrow();
  });

  it('devuelve la instancia y actualiza getAxiosInstance y el export deprecated', () => {
    const instance = initializeAxios({ baseURL: BASE });
    expect(getAxiosInstance()).toBe(instance);
    expect(axiosInstance).toBe(instance);
  });

  it('manda Content-Type y Accept JSON por defecto, y suma los headers propios', async () => {
    initializeAxios({ baseURL: BASE, headers: { 'X-App': 'demo', Accept: 'text/plain' }, timeout: 1234 });
    await getAxiosInstance().post('/dir', { a: 1 });
    initializeAxios({ baseURL: BASE });
    await getAxiosInstance().get('/settings');

    const custom = calls[0]!;
    const defaults = calls[1]!;
    expect(custom.headers['Content-Type']).toBe('application/json');
    expect(custom.headers.Accept).toBe('text/plain');
    expect(custom.headers['X-App']).toBe('demo');
    expect(custom.timeout).toBe(1234);
    expect(defaults.headers.Accept).toBe('application/json');
  });

  it('avisa por consola si llegan claves 1.x sin legacyRefresh', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    initializeAxios({ baseURL: BASE });
    expect(warn).not.toHaveBeenCalled();

    initializeAxios({ baseURL: BASE, db: 'demo', clientID: 'id', clientSecret: 's', fixURL: 'x' } as any);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toContain('db, clientID, clientSecret, fixURL');

    initializeAxios({ baseURL: BASE, legacyRefresh: { fixURL: 'x', clientID: 'id', clientSecret: 's' } });
    expect(warn).toHaveBeenCalledOnce();
  });

  it('una instancia de axios cumple HttpClient', () => {
    const client: HttpClient = initializeAxios({ baseURL: BASE });
    expect(typeof client.get).toBe('function');
    expect(typeof client.interceptors.response.use).toBe('function');
  });
});

describe('setBaseURL y setDatabase', () => {
  it('setBaseURL cambia la base de los requests siguientes', async () => {
    initializeAxios({ baseURL: BASE });
    setBaseURL('https://otro.test/api/db/x');
    await getAxiosInstance().get('/dir');
    expect(fullURL(calls[0]!)).toBe('https://otro.test/api/db/x/dir');
  });

  it.each([
    ['https://histrix.test', 'https://histrix.test/api/db/ventas'],
    ['https://histrix.test/', 'https://histrix.test/api/db/ventas'],
    ['https://histrix.test/api', 'https://histrix.test/api/db/ventas'],
    ['https://histrix.test/api/db/demo', 'https://histrix.test/api/db/ventas'],
    ['https://histrix.test/api/db/demo/', 'https://histrix.test/api/db/ventas'],
    ['https://histrix.test/erp/api/db/demo', 'https://histrix.test/erp/api/db/ventas']
  ])('setDatabase desde %s', (base, expected) => {
    initializeAxios({ baseURL: base });
    setDatabase('ventas');
    expect(getAxiosInstance().defaults.baseURL).toBe(expected);
  });
});

describe('onError', () => {
  const run = async (result: Reply) => {
    reply = () => result;
    await getAxiosInstance()
      .get('/x')
      .catch(() => {});
  };

  it('por defecto se dispara con red y 5xx, no con 4xx', async () => {
    const onError = vi.fn();
    initializeAxios({ baseURL: BASE, onError });

    await run({ status: 400 });
    await run({ status: 401 });
    expect(onError).not.toHaveBeenCalled();

    await run({ status: 503 });
    expect(onError).toHaveBeenLastCalledWith(
      expect.any(AxiosError),
      expect.objectContaining({ kind: 'http', status: 503 })
    );

    await run('network');
    expect(onError).toHaveBeenLastCalledWith(expect.any(AxiosError), expect.objectContaining({ kind: 'network' }));
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('con statuses se dispara sólo con esos (y siempre con red)', async () => {
    const handler = vi.fn();
    initializeAxios({ baseURL: BASE, onError: { handler, statuses: [400] } });

    await run({ status: 500 });
    expect(handler).not.toHaveBeenCalled();
    await run({ status: 400 });
    expect(handler).toHaveBeenCalledOnce();
    await run('network');
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('no se dispara con un request cancelado', async () => {
    const onError = vi.fn();
    initializeAxios({ baseURL: BASE, onError });
    const controller = new AbortController();
    controller.abort();
    await getAxiosInstance()
      .get('/x', { signal: controller.signal })
      .catch(() => {});
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('legacyRefresh', () => {
  const legacy = { fixURL: 'https://auth.test', clientID: 'id', clientSecret: 'secret' };

  it('apagado por defecto: un 401 no refresca ni reintenta', async () => {
    localStorage.setItem('refreshToken', 'r1');
    reply = () => ({ status: 401 });
    initializeAxios({ baseURL: BASE });

    await expect(getAxiosInstance().get('/x')).rejects.toMatchObject({ response: { status: 401 } });
    expect(calls).toHaveLength(1);
  });

  it('prendido: refresca, guarda los tokens y reintenta con el Bearer nuevo', async () => {
    localStorage.setItem('refreshToken', 'r1');
    const updateToken = vi.fn();
    let first = true;
    reply = (config) => {
      if (fullURL(config) === 'https://auth.test/token') {
        return { status: 200, data: { access_token: 'a2', refresh_token: 'r2', expires_in: 60 } };
      }
      if (first) {
        first = false;
        return { status: 401 };
      }
      return { status: 200, data: { ok: true } };
    };
    initializeAxios({ baseURL: BASE, legacyRefresh: { ...legacy, updateToken } });

    const { data } = await getAxiosInstance().get('/x');

    expect(data).toEqual({ ok: true });
    expect(calls.map(fullURL)).toEqual([`${BASE}/x`, 'https://auth.test/token', `${BASE}/x`]);
    expect(JSON.parse(calls[1]!.data)).toMatchObject({
      grant_type: 'refresh_token',
      client_id: 'id',
      client_secret: 'secret',
      refresh_token: 'r1'
    });
    expect(calls[2]!.headers.Authorization).toBe('Bearer a2');
    expect(getAxiosInstance().defaults.headers.common.Authorization).toBe('Bearer a2');
    expect(localStorage.getItem('accessToken')).toBe('a2');
    expect(localStorage.getItem('refreshToken')).toBe('r2');
    expect(updateToken).toHaveBeenCalledWith(expect.objectContaining({ access_token: 'a2' }));
  });

  it('si el reintento vuelve a dar 401, avisa a onError con kind refresh y no refresca de nuevo', async () => {
    localStorage.setItem('refreshToken', 'r1');
    const onError = vi.fn();
    reply = (config) =>
      fullURL(config) === 'https://auth.test/token'
        ? { status: 200, data: { access_token: 'a2', refresh_token: 'r2', expires_in: 60 } }
        : { status: 401 };
    initializeAxios({ baseURL: BASE, onError, legacyRefresh: legacy });

    await expect(getAxiosInstance().get('/x')).rejects.toMatchObject({ response: { status: 401 } });
    expect(calls).toHaveLength(3);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]![1]).toMatchObject({ kind: 'refresh', status: 401 });
  });

  it('si el refresh falla, limpia los tokens, avisa a onError y rechaza', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    localStorage.setItem('accessToken', 'a1');
    reply = () => ({ status: 401 });
    initializeAxios({ baseURL: BASE, onError, legacyRefresh: legacy });

    await expect(getAxiosInstance().get('/x')).rejects.toThrow('No hay token de refresco');
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]![1]).toMatchObject({ kind: 'refresh' });
  });
});

describe('install', () => {
  it('expone la instancia como $axios', () => {
    const app = { config: { globalProperties: {} as Record<string, unknown> } };
    install(app as unknown as App, { baseURL: BASE });
    expect(app.config.globalProperties.$axios).toBe(getAxiosInstance());
  });
});

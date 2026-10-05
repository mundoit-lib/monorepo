import axios, { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachOidcHttp, createOidcHttp, type OidcAuthLike } from './http';
import { createOidcAuth } from './OidcAuth';
import type { OidcUser } from './types';

/** Doble mínimo de `UserManager` para el test de integración con `createOidcAuth`. vi.hoisted: vi.mock se iza arriba. */
const FakeUserManager = vi.hoisted(() => {
  return class FakeUserManagerImpl {
    static instances: FakeUserManagerImpl[] = [];
    events = {
      addUserLoaded: vi.fn(),
      addUserUnloaded: vi.fn(),
      addSilentRenewError: vi.fn(),
      addAccessTokenExpired: vi.fn()
    };
    signinSilent = vi.fn(async () => null as OidcUser | null);
    getUser = vi.fn(async () => null as OidcUser | null);
    stopSilentRenew = vi.fn();
    startSilentRenew = vi.fn();
    constructor(readonly settings: Record<string, unknown>) {
      FakeUserManagerImpl.instances.push(this);
    }
  };
});

vi.mock('oidc-client-ts', () => ({
  UserManager: FakeUserManager,
  WebStorageStateStore: class {
    constructor(public opts: unknown) {}
  }
}));

type Reply = { status: number; data?: unknown } | 'network';

let reply: (config: InternalAxiosRequestConfig, call: number) => Reply;
const calls: InternalAxiosRequestConfig[] = [];

const adapter: AxiosAdapter = async (config) => {
  // Copia de los headers: el reintento pisa el Authorization del mismo objeto config.
  calls.push({ ...config, headers: new AxiosHeaders(config.headers) });
  const result = reply(config, calls.length);
  if (result === 'network') throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config);
  const response = { data: result.data ?? {}, status: result.status, statusText: '', headers: {}, config, request: {} };
  if (result.status >= 200 && result.status < 300) return response;
  throw new AxiosError(`HTTP ${result.status}`, AxiosError.ERR_BAD_RESPONSE, config, {}, response);
};

const authHeader = (config: InternalAxiosRequestConfig) => config.headers.Authorization;

function fakeUser(access_token = 'at-2'): OidcUser {
  return {
    access_token,
    refresh_token: 'rt',
    token_type: 'Bearer',
    expired: false,
    profile: {}
  } as unknown as OidcUser;
}

function fakeAuth(token: string | null = 'at-1') {
  const auth: OidcAuthLike & { token: string | null } = {
    token,
    getToken: vi.fn(() => auth.token),
    renew: vi.fn(async () => {
      auth.token = 'at-2';
      return fakeUser('at-2');
    })
  };
  return auth;
}

/** 401 la primera vez que pasa cada request; 200 en el reintento (el que ya trae el Bearer nuevo). */
const unauthorizedUntilRenewed =
  (fresh = 'at-2') =>
  (config: InternalAxiosRequestConfig) =>
    authHeader(config) === `Bearer ${fresh}` ? { status: 200, data: { ok: true } } : { status: 401 };

const originalAdapter = axios.defaults.adapter;

beforeEach(() => {
  calls.length = 0;
  reply = () => ({ status: 200 });
  axios.defaults.adapter = adapter;
  FakeUserManager.instances = [];
});

afterEach(() => {
  axios.defaults.adapter = originalAdapter;
  vi.restoreAllMocks();
});

describe('attachOidcHttp: Bearer', () => {
  it('manda el access token vigente y nada más (sin client_id ni client_secret)', async () => {
    const http = axios.create({ baseURL: 'https://h/api/db/demo' });
    attachOidcHttp(http, fakeAuth('at-1'));
    reply = () => ({ status: 200, data: { id: 1 } });

    const { data } = await http.get('/me');

    expect(data).toEqual({ id: 1 });
    expect(calls).toHaveLength(1);
    expect(authHeader(calls[0]!)).toBe('Bearer at-1');
    expect(calls[0]!.params).toBeUndefined();
    expect(calls[0]!.data).toBeUndefined();
  });

  it('sin token no agrega Authorization', async () => {
    const http = axios.create();
    attachOidcHttp(http, fakeAuth(null));
    await http.get('/public');
    expect(authHeader(calls[0]!)).toBeUndefined();
  });

  it('sin token respeta un Authorization puesto a mano en el request', async () => {
    const http = axios.create();
    attachOidcHttp(http, fakeAuth(null));
    await http.get('/x', { headers: { Authorization: 'Basic abc' } });
    expect(authHeader(calls[0]!)).toBe('Basic abc');
  });
});

describe('attachOidcHttp: 401 → renew → reintento', () => {
  it('401 → renew → reintenta una vez con el token nuevo y devuelve la respuesta del reintento', async () => {
    const http = axios.create();
    const auth = fakeAuth('at-1');
    attachOidcHttp(http, auth);
    reply = unauthorizedUntilRenewed();

    const { data } = await http.post('/items', { a: 1 });

    expect(data).toEqual({ ok: true });
    expect(auth.renew).toHaveBeenCalledTimes(1);
    expect(calls.map(authHeader)).toEqual(['Bearer at-1', 'Bearer at-2']);
    expect(calls[1]!.method).toBe('post');
    expect(calls[1]!.url).toBe('/items');
    expect(JSON.parse(calls[1]!.data as string)).toEqual({ a: 1 });
  });

  it('401 → renew rechaza → sale el 401 original', async () => {
    const http = axios.create();
    const auth = fakeAuth('at-1');
    auth.renew = vi.fn(async () => {
      throw new Error('invalid_grant');
    });
    attachOidcHttp(http, auth);
    reply = () => ({ status: 401 });

    const error = await http.get('/me').catch((e: AxiosError) => e);

    expect(axios.isAxiosError(error) && error.response?.status).toBe(401);
    expect(auth.renew).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1);
  });

  it('401 → renew devuelve null (sin issuer o sin sesión) → sale el 401 original sin reintentar', async () => {
    const http = axios.create();
    const auth = fakeAuth('at-1');
    auth.renew = vi.fn(async () => null);
    attachOidcHttp(http, auth);
    reply = () => ({ status: 401 });

    const error = await http.get('/me').catch((e: AxiosError) => e);

    expect(axios.isAxiosError(error) && error.response?.status).toBe(401);
    expect(calls).toHaveLength(1);
  });

  it('si el reintento también da 401, se propaga: un solo renew por request, sin loop', async () => {
    const http = axios.create();
    const auth = fakeAuth('at-1');
    attachOidcHttp(http, auth);
    reply = () => ({ status: 401 });

    const error = await http.get('/me').catch((e: AxiosError) => e);

    expect(axios.isAxiosError(error) && error.response?.status).toBe(401);
    expect(auth.renew).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
  });

  it('401 escalonado: si el token vigente ya cambió desde que salió el request, reintenta sin renovar de nuevo', async () => {
    const http = axios.create();
    const auth = fakeAuth('at-1');
    attachOidcHttp(http, auth);
    // B salió con at-1; mientras viajaba, otro request renovó y el token vigente pasó a at-2.
    reply = (config) => {
      if (authHeader(config) === 'Bearer at-1') auth.token = 'at-2';
      return unauthorizedUntilRenewed()(config);
    };

    const { data } = await http.get('/b');

    expect(data).toEqual({ ok: true });
    expect(auth.renew).not.toHaveBeenCalled();
    expect(calls.map(authHeader)).toEqual(['Bearer at-1', 'Bearer at-2']);
  });

  it('401 con el mismo token vigente que se mandó → sí renueva (el token fue rechazado, no reemplazado)', async () => {
    const http = axios.create();
    const auth = fakeAuth('at-1');
    attachOidcHttp(http, auth);
    reply = unauthorizedUntilRenewed();

    await http.get('/a');

    expect(auth.renew).toHaveBeenCalledTimes(1);
  });

  it('otros errores pasan sin renew: 500, 403 y error de red', async () => {
    const http = axios.create();
    const auth = fakeAuth('at-1');
    attachOidcHttp(http, auth);

    for (const status of [500, 403]) {
      reply = () => ({ status });
      const error = await http.get('/x').catch((e: AxiosError) => e);
      expect(axios.isAxiosError(error) && error.response?.status).toBe(status);
    }
    reply = () => 'network';
    const network = await http.get('/x').catch((e: AxiosError) => e);
    expect(axios.isAxiosError(network) && network.code).toBe(AxiosError.ERR_NETWORK);

    expect(auth.renew).not.toHaveBeenCalled();
    expect(calls).toHaveLength(3);
  });

  it('un 200 no pasa por renew', async () => {
    const http = axios.create();
    const auth = fakeAuth('at-1');
    attachOidcHttp(http, auth);
    await http.get('/x');
    expect(auth.renew).not.toHaveBeenCalled();
  });
});

describe('attachOidcHttp: attach y detach', () => {
  it('attachear dos veces la misma instancia no duplica interceptores y devuelve el mismo detach', async () => {
    const http = axios.create();
    const auth = fakeAuth('at-1');
    const detach = attachOidcHttp(http, auth);
    expect(attachOidcHttp(http, auth)).toBe(detach);
    reply = unauthorizedUntilRenewed();

    await http.get('/me');

    // getToken: request original, chequeo del 401 y reintento; con interceptores duplicados serían 6.
    expect(auth.getToken).toHaveBeenCalledTimes(3);
    expect(auth.renew).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
  });

  it('detach saca el Bearer y el reintento; después se puede volver a attachear', async () => {
    const http = axios.create();
    const auth = fakeAuth('at-1');
    const detach = attachOidcHttp(http, auth);
    detach();
    reply = () => ({ status: 401 });

    await expect(http.get('/me')).rejects.toMatchObject({ response: { status: 401 } });
    expect(authHeader(calls[0]!)).toBeUndefined();
    expect(auth.renew).not.toHaveBeenCalled();

    expect(attachOidcHttp(http, auth)).not.toBe(detach);
    reply = () => ({ status: 200 });
    await http.get('/me');
    expect(authHeader(calls[1]!)).toBe('Bearer at-1');
  });
});

describe('createOidcHttp', () => {
  it('crea una instancia de axios con la config dada y ya attacheada', async () => {
    const http = createOidcHttp(fakeAuth('at-1'), { baseURL: 'https://h/api/db/demo', timeout: 5000 });
    reply = unauthorizedUntilRenewed();

    const { data } = await http.get('/me');

    expect(data).toEqual({ ok: true });
    expect(http.defaults.baseURL).toBe('https://h/api/db/demo');
    expect(http.defaults.timeout).toBe(5000);
    expect(calls[0]!.baseURL).toBe('https://h/api/db/demo');
    expect(calls.map(authHeader)).toEqual(['Bearer at-1', 'Bearer at-2']);
  });

  it('cada createOidcHttp es independiente de axios global y de otras instancias', async () => {
    const a = createOidcHttp(fakeAuth('at-a'));
    const b = createOidcHttp(fakeAuth('at-b'));
    await a.get('/x');
    await b.get('/x');
    await axios.get('/x');
    expect(calls.map(authHeader)).toEqual(['Bearer at-a', 'Bearer at-b', undefined]);
  });
});

describe('integración con createOidcAuth: una sola renovación para varios 401 simultáneos', () => {
  it('dos 401 a la vez → un solo signinSilent → los dos se reintentan con el token nuevo', async () => {
    const auth = createOidcAuth({ issuer: 'https://h/api/db/demo' });
    const um = FakeUserManager.instances.at(-1)!;
    let resolveRenew!: (user: OidcUser) => void;
    um.signinSilent.mockReturnValue(new Promise<OidcUser | null>((r) => (resolveRenew = r)));
    const http = createOidcHttp(auth);
    reply = unauthorizedUntilRenewed('at-9');

    const pending = Promise.all([http.get('/a'), http.get('/b')]);
    await vi.waitFor(() => expect(um.signinSilent).toHaveBeenCalledTimes(1));
    resolveRenew(fakeUser('at-9'));
    const [a, b] = await pending;

    expect(a.data).toEqual({ ok: true });
    expect(b.data).toEqual({ ok: true });
    expect(um.signinSilent).toHaveBeenCalledTimes(1);
    expect(auth.getToken()).toBe('at-9');
    // Dos pedidos sin Bearer (no había sesión), dos reintentos con el token renovado.
    expect(calls.map(authHeader).toSorted()).toEqual(['Bearer at-9', 'Bearer at-9', undefined, undefined]);
    expect(calls.map((c) => c.url).toSorted()).toEqual(['/a', '/a', '/b', '/b']);
  });

  it('con el refresh fallando (invalid_grant), los pedidos reciben el 401 original', async () => {
    const auth = createOidcAuth({ issuer: 'https://h/api/db/demo' });
    FakeUserManager.instances.at(-1)!.signinSilent.mockRejectedValue(new Error('invalid_grant'));
    const http = createOidcHttp(auth);
    reply = () => ({ status: 401 });

    await expect(http.get('/a')).rejects.toMatchObject({ response: { status: 401 } });
    expect(calls).toHaveLength(1);
    expect(auth.check()).toBe(false);
  });
});

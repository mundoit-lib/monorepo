import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './AuthService';
import { type Request, createHttp, httpError, memoryStorage } from './test-utils';

const USER = { id: 1, name: 'Ana' };

/** Backend de prueba: emite `token-N` y rechaza con 401 los requests con un token que no es el último. */
function createBackend() {
  let issued = 0;
  const backend = {
    validToken: '',
    refreshCalls: 0,
    handler(request: Request): unknown {
      if (request.url.endsWith('/token')) {
        if (request.data.grant_type === 'refresh_token') {
          backend.refreshCalls++;
          if (request.data.refresh_token !== `refresh-${issued}`) throw httpError(401);
        } else if (request.data.password !== 'secret') {
          throw httpError(400);
        }
        issued++;
        backend.validToken = `token-${issued}`;
        return { access_token: backend.validToken, refresh_token: `refresh-${issued}`, expires_in: 120 };
      }
      if (request.headers.Authorization !== `Bearer ${backend.validToken}`) throw httpError(401);
      if (request.url.endsWith('/me')) return USER;
      if (request.url.endsWith('/logout')) return {};
      return { url: request.url };
    }
  };
  return backend;
}

function setup(options: ConstructorParameters<typeof AuthService>[0] = {}, initial: Record<string, string> = {}) {
  const backend = createBackend();
  const http = createHttp((request) => backend.handler(request));
  const storage = memoryStorage(initial);
  const service = new AuthService({
    http,
    storage,
    endpoints: { login: '/token', me: '/me', logout: '/logout' },
    oauth: { clientId: 'app', clientSecret: 's3' },
    ...options
  });
  return { backend, http, storage, service };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('AuthService', () => {
  it('login guarda los tokens con las keys de 1.x y pide el usuario', async () => {
    const { service, storage, http } = setup();

    await service.login({ data: { username: 'ana', password: 'secret' } });

    expect(storage.data.get('accessToken')).toBe('token-1');
    expect(storage.data.get('refreshToken')).toBe('refresh-1');
    expect(Number(storage.data.get('tokenExpireDate'))).toBeGreaterThan(Date.now());
    expect(http.requests[0]!.data).toMatchObject({ grant_type: 'password', client_id: 'app', username: 'ana' });
    expect(http.requests[0]!.headers.Authorization).toBeUndefined();
    expect(service.user()).toEqual(USER);
    expect(service.user('name')).toBe('Ana');
    expect(service.check()).toBe(true);
  });

  it('login fallido rechaza y no deja sesión', async () => {
    const { service, storage } = setup();

    await expect(service.login({ data: { username: 'ana', password: 'mal' } })).rejects.toThrow('HTTP 400');
    expect(storage.data.size).toBe(0);
    expect(service.check()).toBe(false);
  });

  it('login estilo histrix: url propia, body tal cual, fetchUser false y user(obj)', async () => {
    const { service, http, storage } = setup();
    const data = {
      username: 'ana',
      password: 'secret',
      grant_type: 'password',
      client_id: 'x',
      notification_token: null
    };

    await service.login({ url: 'https://h/api/db/tork/token', data, fetchUser: false, rememberMe: true });

    expect(http.requests).toHaveLength(1);
    expect(http.requests[0]).toMatchObject({ url: 'https://h/api/db/tork/token', data });
    expect(service.check()).toBe(false);

    service.user(USER);
    expect(service.check()).toBe(true);

    await service.refresh();
    expect(http.requests[1]!.url).toBe('https://h/api/db/tork/token');
    expect(storage.data.get('accessToken')).toBe('token-2');
  });

  it('endpoint como función y setBaseURL', async () => {
    const db = { name: 'tork' };
    const { service, http } = setup({
      endpoints: { login: ({ baseURL }) => `${baseURL}/api/db/${db.name}/token`, me: '/me', logout: null }
    });
    service.setBaseURL('https://host');

    await service.login({ data: { username: 'ana', password: 'secret' } });

    expect(http.requests.map((r) => r.url)).toEqual(['https://host/api/db/tork/token', 'https://host/me']);
  });

  it('un 401 refresca una sola vez para dos requests concurrentes y los reintenta', async () => {
    const { service, backend, http } = setup();
    await service.login({ data: { username: 'ana', password: 'secret' } });
    backend.validToken = 'otro'; // el servidor invalidó el access token

    // El refresh emite token-2 y lo marca como válido.
    const [a, b] = await Promise.all([http.get('/a'), http.get('/b')]);

    expect(backend.refreshCalls).toBe(1);
    expect(a.data).toEqual({ url: '/a' });
    expect(b.data).toEqual({ url: '/b' });
    expect(http.requests.filter((r) => r.url === '/a').map((r) => r.headers.Authorization)).toEqual([
      'Bearer token-1',
      'Bearer token-2'
    ]);
  });

  it('si el refresh falla, cierra la sesión y rechaza el request', async () => {
    const { service, backend, storage, http } = setup();
    await service.login({ data: { username: 'ana', password: 'secret' } });
    backend.validToken = 'otro';
    storage.set('refreshToken', 'vencido');

    await expect(http.get('/a')).rejects.toThrow('HTTP 401');
    expect(storage.data.get('accessToken')).toBeUndefined();
    expect(service.check()).toBe(false);
  });

  it('refresca por timer antes del vencimiento', async () => {
    vi.useFakeTimers();
    const { service, backend, storage } = setup({ refreshBeforeExpiry: 60 });
    await service.login({ data: { username: 'ana', password: 'secret' } });

    await vi.advanceTimersByTimeAsync(59_000);
    expect(backend.refreshCalls).toBe(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(backend.refreshCalls).toBe(1);
    expect(storage.data.get('accessToken')).toBe('token-2');

    service.destroy();
  });

  it('al volver al frente revalida el vencimiento (timers suspendidos en PWA)', async () => {
    vi.useFakeTimers();
    const listeners: Record<string, () => void> = {};
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: (event: string, fn: () => void) => {
        listeners[event] = fn;
      },
      removeEventListener: vi.fn()
    });
    try {
      const { service, backend } = setup();
      await service.login({ data: { username: 'ana', password: 'secret' } });

      // El sistema durmió la pestaña: el reloj avanzó sin que corrieran los timers.
      vi.setSystemTime(Date.now() + 115_000);
      listeners.visibilitychange!();
      await vi.advanceTimersByTimeAsync(0);

      expect(backend.refreshCalls).toBe(1);
      service.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('logout pide el endpoint y limpia el storage', async () => {
    const { service, storage, http } = setup();
    await service.login({ data: { username: 'ana', password: 'secret' } });

    await service.logout();

    expect(http.requests.at(-1)?.url).toBe('/logout');
    expect(storage.data.size).toBe(0);
    expect(service.user()).toBeNull();
    expect(service.check()).toBe(false);
  });

  it('logout con endpoints.logout null no hace request', async () => {
    const { service, http, storage } = setup({ endpoints: { login: '/token', me: '/me', logout: null } });
    await service.login({ data: { username: 'ana', password: 'secret' } });
    const count = http.requests.length;

    await service.logout();

    expect(http.requests).toHaveLength(count);
    expect(storage.data.size).toBe(0);
  });

  it('init() restaura una sesión guardada por 1.x', async () => {
    const { service, backend } = setup(
      {},
      { accessToken: 'token-0', refreshToken: 'refresh-0', tokenExpireDate: String(Date.now() + 3_600_000) }
    );
    backend.validToken = 'token-0';

    await expect(service.init()).resolves.toBe(true);

    expect(service.ready()).toBe(true);
    expect(service.user()).toEqual(USER);
    expect(service.check()).toBe(true);
    service.destroy();
  });

  it('init() refresca si el token guardado venció', async () => {
    const { service, backend, storage } = setup(
      {},
      { accessToken: 'viejo', refreshToken: 'refresh-0', tokenExpireDate: String(Date.now() - 1000) }
    );

    await expect(service.init()).resolves.toBe(true);

    expect(backend.refreshCalls).toBe(1);
    expect(storage.data.get('accessToken')).toBe('token-1');
    expect(service.check()).toBe(true);
    service.destroy();
  });

  it('init() no borra la sesión si /me falla por algo que no es 401', async () => {
    const { service, storage, http } = setup(
      { endpoints: { login: '/token', me: '/no-existe', logout: null } },
      { accessToken: 'token-0', refreshToken: 'refresh-0' }
    );
    http.interceptors.request.use((config: Request) => {
      if (config.url === '/no-existe') throw httpError(404);
      return config;
    });

    await expect(service.init()).resolves.toBe(false);
    expect(storage.data.get('accessToken')).toBe('token-0');
  });

  it('attach es idempotente', async () => {
    const { service, http, backend } = setup();
    service.attach(http);
    service.attach(http);
    await service.login({ data: { username: 'ana', password: 'secret' } });
    backend.validToken = 'otro';

    await http.get('/a');

    expect(backend.refreshCalls).toBe(1);
    expect(http.requests.filter((r) => r.url === '/a')).toHaveLength(2);
  });
});

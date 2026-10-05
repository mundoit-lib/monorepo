import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOidcAuth, DEFAULT_CLIENT_ID, DEFAULT_SCOPE } from './OidcAuth';
import type { OidcStorage, OidcUser } from './types';

/** Doble de `UserManager`: registra settings y eventos, y expone los métodos como mocks. vi.hoisted: vi.mock se iza arriba. */
const FakeUserManager = vi.hoisted(() => {
  return class FakeUserManagerImpl {
    static instances: FakeUserManagerImpl[] = [];
    readonly settings: Record<string, unknown>;
    private handlers = { loaded: new Set<(u: OidcUser) => void>(), unloaded: new Set<() => void>() };
    events = {
      addUserLoaded: vi.fn((cb: (u: OidcUser) => void) => {
        this.handlers.loaded.add(cb);
        return () => this.handlers.loaded.delete(cb);
      }),
      addUserUnloaded: vi.fn((cb: () => void) => {
        this.handlers.unloaded.add(cb);
        return () => this.handlers.unloaded.delete(cb);
      }),
      addSilentRenewError: vi.fn()
    };
    metadataService = { getEndSessionEndpoint: vi.fn(async () => undefined as string | undefined) };
    signinRedirect = vi.fn(async () => {});
    signinRedirectCallback = vi.fn(async (_url?: string) => fakeUser());
    signinSilent = vi.fn(async () => fakeUser() as OidcUser | null);
    signoutRedirect = vi.fn(async () => {});
    getUser = vi.fn(async () => null as OidcUser | null);
    removeUser = vi.fn(async () => {});
    stopSilentRenew = vi.fn();
    startSilentRenew = vi.fn();

    constructor(settings: Record<string, unknown>) {
      this.settings = settings;
      FakeUserManagerImpl.instances.push(this);
    }

    emitLoaded(user: OidcUser) {
      for (const cb of this.handlers.loaded) cb(user);
    }
    emitUnloaded() {
      for (const cb of this.handlers.unloaded) cb();
    }
  };
});

vi.mock('oidc-client-ts', () => ({
  UserManager: FakeUserManager,
  WebStorageStateStore: class {
    constructor(public opts: unknown) {}
  }
}));

function fakeUser(overrides: Partial<Record<keyof OidcUser, unknown>> = {}): OidcUser {
  return {
    access_token: 'at-1',
    refresh_token: 'rt-1',
    token_type: 'Bearer',
    expired: false,
    profile: { sub: '42', name: 'Ana' },
    state: undefined,
    ...overrides
  } as unknown as OidcUser;
}

function memoryStorage(): OidcStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i) => Array.from(map.keys())[i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k)
  };
}

const last = () => FakeUserManager.instances.at(-1)!;

beforeEach(() => {
  FakeUserManager.instances = [];
});

describe('createOidcAuth: issuer y UserManager', () => {
  it('arma el issuer de Histrix desde { host, db } y configura code + PKCE sin iframe', () => {
    const auth = createOidcAuth({ issuer: { host: 'https://cliente.histrix.com.ar/', db: 'demo' } });
    expect(auth.getIssuer()).toBe('https://cliente.histrix.com.ar/api/db/demo');
    expect(last().settings).toMatchObject({
      authority: 'https://cliente.histrix.com.ar/api/db/demo',
      client_id: DEFAULT_CLIENT_ID,
      response_type: 'code',
      scope: DEFAULT_SCOPE,
      automaticSilentRenew: true,
      monitorSession: false,
      loadUserInfo: false
    });
    expect(last().settings).not.toHaveProperty('client_secret');
  });

  it('sin issuer no crea manager: login falla y restore/renew devuelven null', async () => {
    const auth = createOidcAuth();
    expect(auth.getIssuer()).toBeNull();
    expect(auth.getUserManager()).toBeNull();
    await expect(auth.login()).rejects.toThrow(/issuer/);
    expect(await auth.restore()).toBeNull();
    expect(await auth.renew()).toBeNull();
    expect(FakeUserManager.instances).toHaveLength(0);
  });

  it('userManagerSettings pisa los defaults', () => {
    createOidcAuth({ issuer: 'https://h/api/db/x', clientId: 'otro', userManagerSettings: { loadUserInfo: true } });
    expect(last().settings).toMatchObject({ client_id: 'otro', loadUserInfo: true });
  });

  it('setIssuer: un manager por issuer, reutiliza el existente y descarta la sesión del anterior', async () => {
    const auth = createOidcAuth({ issuer: { host: 'https://a', db: 'a' } });
    const a = last();
    a.getUser.mockResolvedValue(fakeUser());
    await auth.restore();
    expect(auth.check()).toBe(true);

    auth.setIssuer({ host: 'https://b', db: 'b' });
    const b = last();
    expect(b).not.toBe(a);
    expect(a.stopSilentRenew).toHaveBeenCalled();
    expect(auth.check()).toBe(false);
    expect(auth.getUserManager()).toBe(b);

    auth.setIssuer('https://a/api/db/a/');
    expect(FakeUserManager.instances).toHaveLength(2);
    expect(auth.getUserManager()).toBe(a);
    expect(a.startSilentRenew).toHaveBeenCalled();

    auth.setIssuer(null);
    expect(auth.getUserManager()).toBeNull();
    expect(auth.getIssuer()).toBeNull();
  });

  it('los eventos de un manager que dejó de ser el actual no tocan la sesión', () => {
    const auth = createOidcAuth({ issuer: 'https://a' });
    const a = last();
    auth.setIssuer('https://b');
    a.emitLoaded(fakeUser());
    expect(auth.check()).toBe(false);
    last().emitLoaded(fakeUser());
    expect(auth.check()).toBe(true);
    a.emitUnloaded();
    expect(auth.check()).toBe(true);
  });
});

describe('createOidcAuth: login y callback', () => {
  it('login redirige al authorize con el redirect en state y no resuelve', async () => {
    const auth = createOidcAuth({ issuer: 'https://a' });
    const pending = auth.login({ redirect: '/pedidos', username: 'ignorado', password: 'ignorado' });
    await vi.waitFor(() => expect(last().signinRedirect).toHaveBeenCalledWith({ state: { redirect: '/pedidos' } }));
    const settled = await Promise.race([pending.then(() => 'resuelta'), Promise.resolve('pendiente')]);
    expect(settled).toBe('pendiente');
  });

  it('login sin redirect manda "/"', async () => {
    const auth = createOidcAuth({ issuer: 'https://a' });
    void auth.login();
    await vi.waitFor(() => expect(last().signinRedirect).toHaveBeenCalledWith({ state: { redirect: '/' } }));
  });

  it('handleCallback canjea el code, guarda la sesión y devuelve el redirect del state', async () => {
    const auth = createOidcAuth({ issuer: 'https://a' });
    last().signinRedirectCallback.mockResolvedValue(fakeUser({ state: { redirect: '/pedidos' } }));
    const result = await auth.handleCallback('https://app/callback?code=1&state=x');
    expect(last().signinRedirectCallback).toHaveBeenCalledWith('https://app/callback?code=1&state=x');
    expect(result.redirect).toBe('/pedidos');
    expect(result.user.access_token).toBe('at-1');
    expect(auth.check()).toBe(true);
    expect(auth.getToken()).toBe('at-1');
  });

  it('handleCallback sin state devuelve "/"', async () => {
    const auth = createOidcAuth({ issuer: 'https://a' });
    expect((await auth.handleCallback()).redirect).toBe('/');
  });
});

describe('createOidcAuth: restore y renew', () => {
  it('restore carga la sesión guardada vigente', async () => {
    const auth = createOidcAuth({ issuer: 'https://a' });
    last().getUser.mockResolvedValue(fakeUser());
    expect(await auth.restore()).not.toBeNull();
    expect(last().signinSilent).not.toHaveBeenCalled();
    expect(auth.check()).toBe(true);
    expect(auth.token()).toBe('at-1');
  });

  it('restore renueva con refresh token si la sesión venció', async () => {
    const auth = createOidcAuth({ issuer: 'https://a' });
    last().getUser.mockResolvedValue(fakeUser({ expired: true }));
    last().signinSilent.mockResolvedValue(fakeUser({ access_token: 'at-2' }));
    const user = await auth.restore();
    expect(user?.access_token).toBe('at-2');
    expect(auth.getToken()).toBe('at-2');
  });

  it('restore devuelve null si venció y el refresh falla, sin tirar', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const auth = createOidcAuth({ issuer: 'https://a' });
    last().getUser.mockResolvedValue(fakeUser({ expired: true }));
    last().signinSilent.mockRejectedValue(new Error('invalid_grant'));
    expect(await auth.restore()).toBeNull();
    expect(auth.check()).toBe(false);
    expect(auth.getToken()).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('restore con sesión vencida y sin refresh token devuelve null', async () => {
    const auth = createOidcAuth({ issuer: 'https://a' });
    last().getUser.mockResolvedValue(fakeUser({ expired: true, refresh_token: undefined }));
    expect(await auth.restore()).toBeNull();
    expect(last().signinSilent).not.toHaveBeenCalled();
  });

  it('renew fuerza signinSilent y actualiza el token', async () => {
    const auth = createOidcAuth({ issuer: 'https://a' });
    last().signinSilent.mockResolvedValue(fakeUser({ access_token: 'at-3' }));
    expect((await auth.renew())?.access_token).toBe('at-3');
    expect(auth.getToken()).toBe('at-3');
  });

  it('getToken y check siguen el vencimiento del token guardado', async () => {
    const auth = createOidcAuth({ issuer: 'https://a' });
    const user = fakeUser();
    last().getUser.mockResolvedValue(user);
    await auth.restore();
    expect(auth.check()).toBe(true);
    (user as unknown as { expired: boolean }).expired = true;
    expect(auth.check()).toBe(false);
    expect(auth.getToken()).toBeNull();
  });
});

describe('createOidcAuth: usuario de la app y onUserChange', () => {
  it('user() lee el usuario guardado en storage bajo la key `user`', () => {
    const storage = memoryStorage();
    storage.setItem('user', JSON.stringify({ id: 7 }));
    const auth = createOidcAuth<{ id: number }>({ storage });
    expect(auth.user()).toEqual({ id: 7 });
  });

  it('setUser persiste y notifica; setUser(null) borra', () => {
    const storage = memoryStorage();
    const auth = createOidcAuth<{ id: number }>({ storage });
    const seen: unknown[] = [];
    const off = auth.onUserChange((u) => seen.push(u));
    auth.setUser({ id: 1 });
    expect(storage.getItem('user')).toBe('{"id":1}');
    auth.setUser(null);
    expect(storage.getItem('user')).toBeNull();
    off();
    auth.setUser({ id: 2 });
    expect(seen).toEqual([{ id: 1 }, null]);
  });

  it('sin usuario de la app, user() devuelve los claims de la sesión OIDC', async () => {
    const auth = createOidcAuth({ issuer: 'https://a', storage: memoryStorage() });
    expect(auth.user()).toBeNull();
    last().getUser.mockResolvedValue(fakeUser());
    await auth.restore();
    expect(auth.user()).toEqual({ sub: '42', name: 'Ana' });
    auth.setUser({ id: 1 });
    expect(auth.user()).toEqual({ id: 1 });
  });

  it('onUserChange no repite el mismo usuario y sobrevive a un listener que tira', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const auth = createOidcAuth({ issuer: 'https://a', storage: memoryStorage() });
    const seen: unknown[] = [];
    auth.onUserChange(() => {
      throw new Error('boom');
    });
    auth.onUserChange((u) => seen.push(u));
    const user = fakeUser();
    last().emitLoaded(user);
    last().emitLoaded(user);
    expect(seen).toEqual([user.profile]);
    last().emitUnloaded();
    expect(seen).toEqual([user.profile, null]);
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  it('un JSON roto en storage cuenta como sin usuario', () => {
    const storage = memoryStorage();
    storage.setItem('user', '{nope');
    expect(createOidcAuth({ storage }).user()).toBeNull();
  });
});

describe('createOidcAuth: logout', () => {
  it('sin end_session: borra tokens y usuario, notifica y navega al redirect', async () => {
    const storage = memoryStorage();
    const auth = createOidcAuth({ issuer: 'https://a', storage });
    auth.navigate = vi.fn();
    auth.setUser({ id: 1 });
    last().getUser.mockResolvedValue(fakeUser());
    await auth.restore();
    const seen: unknown[] = [];
    auth.onUserChange((u) => seen.push(u));

    await auth.logout({ redirect: '/login' });
    expect(last().removeUser).toHaveBeenCalled();
    expect(last().signoutRedirect).not.toHaveBeenCalled();
    expect(storage.getItem('user')).toBeNull();
    expect(auth.check()).toBe(false);
    expect(auth.user()).toBeNull();
    expect(seen).toEqual([null]);
    expect(auth.navigate).toHaveBeenCalledWith('/login');
  });

  it('con end_session_endpoint en el discovery: signoutRedirect', async () => {
    const auth = createOidcAuth({ issuer: 'https://a', storage: memoryStorage() });
    last().metadataService.getEndSessionEndpoint.mockResolvedValue('https://a/end_session');
    await auth.logout();
    expect(last().signoutRedirect).toHaveBeenCalled();
    expect(last().removeUser).not.toHaveBeenCalled();
  });

  it('endSession: false fuerza el logout local aunque el issuer lo anuncie', async () => {
    const auth = createOidcAuth({ issuer: 'https://a', storage: memoryStorage() });
    last().metadataService.getEndSessionEndpoint.mockResolvedValue('https://a/end_session');
    await auth.logout({ endSession: false });
    expect(last().metadataService.getEndSessionEndpoint).not.toHaveBeenCalled();
    expect(last().removeUser).toHaveBeenCalled();
  });

  it('si el discovery falla, hace logout local', async () => {
    const auth = createOidcAuth({ issuer: 'https://a', storage: memoryStorage() });
    last().metadataService.getEndSessionEndpoint.mockRejectedValue(new Error('offline'));
    await auth.logout();
    expect(last().removeUser).toHaveBeenCalled();
  });

  it('sin issuer, logout sólo limpia el usuario local', async () => {
    const storage = memoryStorage();
    const auth = createOidcAuth({ storage });
    auth.setUser({ id: 1 });
    await auth.logout();
    expect(storage.getItem('user')).toBeNull();
  });
});

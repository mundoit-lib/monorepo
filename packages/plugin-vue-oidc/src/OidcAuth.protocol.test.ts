import axios, { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import type { OidcClient } from 'oidc-client-ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeIssuer, type FakeIssuer, stubFetch } from './fake-issuer';
import { attachOidcHttp } from './http';
import { createOidcAuth } from './OidcAuth';
import type { OidcAuth, OidcAuthOptions, OidcStorage } from './types';

/**
 * Tests de protocolo: `oidc-client-ts` real contra un issuer falso que contesta por `fetch` (discovery, token endpoint
 * con PKCE y rotación del refresh, userinfo). Lo que mockean los otros tests (`UserManager`) acá se ejecuta de verdad.
 * `login()` no entra porque `signinRedirect` navega con `window.location`: se arma el mismo pedido con
 * `createSigninRequest({ state })` y el issuer falso "loguea" devolviendo la URL del callback.
 */

const APP = 'https://app.test';
const HOST = 'https://cliente.histrix.test';
const issuerUrl = (db: string) => `${HOST}/api/db/${db}`;
const tenant = (db: string) => ({ host: HOST, db });
const userKey = (db: string) => `oidc.user:${issuerUrl(db)}:histrix-app`;

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

const makeAuth = (storage: OidcStorage, options: OidcAuthOptions = {}) =>
  createOidcAuth({ issuer: tenant('demo'), redirectUri: `${APP}/callback`, storage, ...options });

/**
 * El `OidcClient` interno del `UserManager`: `signinRedirect` es `_client.createSigninRequest(...)` más la navegación,
 * y es el que guarda el state + code_verifier que después lee `signinRedirectCallback`.
 */
const clientOf = (auth: OidcAuth<Record<string, unknown>>): OidcClient =>
  (auth.getUserManager() as unknown as { _client: OidcClient })._client;

/** Authorize + login + consent + callback, como lo haría la persona en el browser. */
async function loginAt(auth: OidcAuth<Record<string, unknown>>, issuer: FakeIssuer, redirect = '/inicio') {
  const request = await clientOf(auth).createSigninRequest({ state: { redirect } });
  return { authorizeUrl: request.url, result: await auth.handleCallback(issuer.authorize(request.url)) };
}

const ONE_HOUR = 3600 * 1000;
const refreshRequests = (issuer: FakeIssuer) => issuer.tokenRequests.filter((r) => r.grant_type === 'refresh_token');

let demo: FakeIssuer;
let restoreFetch: () => void;

beforeEach(() => {
  // Timers falsos: los timers de vencimiento de oidc-client-ts (1 s de intervalo) no disparan renovaciones de fondo
  // en medio de un test, y `setSystemTime` deja vencer un access token sin esperar.
  vi.useFakeTimers();
  demo = createFakeIssuer({
    issuer: issuerUrl('demo'),
    redirectUri: `${APP}/callback`,
    claims: { sub: '42', name: 'Ana Prueba', preferred_username: 'ana' },
    userInfoClaims: { email: 'ana@cliente.test' }
  });
  restoreFetch = stubFetch(demo);
});

afterEach(() => {
  restoreFetch();
  vi.useRealTimers();
});

describe('protocolo: canje del code (authorization_code + PKCE S256)', () => {
  it('arma el authorize con code + PKCE y canjea el code con el code_verifier, sin secret', async () => {
    const storage = memoryStorage();
    const auth = makeAuth(storage);
    const { authorizeUrl, result } = await loginAt(auth, demo);

    const params = new URL(authorizeUrl).searchParams;
    expect(authorizeUrl.startsWith(`${issuerUrl('demo')}/authorize?`)).toBe(true);
    expect(params.get('response_type')).toBe('code');
    expect(params.get('client_id')).toBe('histrix-app');
    expect(params.get('redirect_uri')).toBe(`${APP}/callback`);
    expect(params.get('scope')).toBe('openid profile email offline_access');
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(params.get('state')).toBeTruthy();

    expect(demo.discoveryCount()).toBe(1);
    expect(demo.tokenRequests).toHaveLength(1);
    expect(demo.tokenRequests[0]).toMatchObject({
      url: `${issuerUrl('demo')}/token`,
      grant_type: 'authorization_code',
      redirect_uri: `${APP}/callback`,
      client_id: 'histrix-app',
      client_secret: null
    });
    expect(demo.tokenRequests[0]!.code_verifier).toMatch(/^[\w-]{43,128}$/);

    expect(result.redirect).toBe('/inicio');
    expect(demo.accessTokens.has(result.user.access_token)).toBe(true);
    expect(demo.refreshTokens.has(result.user.refresh_token!)).toBe(true);
    expect(auth.check()).toBe(true);
    expect(auth.getToken()).toBe(result.user.access_token);
    // Sin usuario de la app, user() son los claims del id_token sin los de protocolo (iss, aud, exp, nonce…).
    expect(auth.user()).toMatchObject({ sub: '42', name: 'Ana Prueba', preferred_username: 'ana' });
    expect(auth.user()).not.toHaveProperty('nonce');
    // La sesión queda persistida con la key que usa oidc-client-ts: issuer + client.
    expect(JSON.parse(storage.getItem(userKey('demo'))!)).toMatchObject({ refresh_token: result.user.refresh_token });
  });

  it('callback con state inválido: rechaza antes de tocar el token endpoint y no deja sesión', async () => {
    const auth = makeAuth(memoryStorage());
    const listener = vi.fn();
    auth.onUserChange(listener);

    await expect(auth.handleCallback(`${APP}/callback?code=code-x&state=inventado`)).rejects.toThrow(
      /No matching state/
    );

    expect(demo.tokenRequests).toHaveLength(0);
    expect(auth.check()).toBe(false);
    expect(auth.getToken()).toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });

  it('el callback es de un solo uso: repetir la misma URL falla porque el state ya se consumió', async () => {
    const auth = makeAuth(memoryStorage());
    const request = await clientOf(auth).createSigninRequest({ state: { redirect: '/' } });
    const callbackUrl = demo.authorize(request.url);
    await auth.handleCallback(callbackUrl);

    await expect(auth.handleCallback(callbackUrl)).rejects.toThrow(/No matching state/);
    expect(demo.tokenRequests).toHaveLength(1);
    expect(auth.check()).toBe(true);
  });

  it('si el issuer rechaza el code (invalid_grant), el callback rechaza con el error OAuth y no hay sesión', async () => {
    const auth = makeAuth(memoryStorage());
    const request = await clientOf(auth).createSigninRequest({ state: { redirect: '/' } });
    const callbackUrl = demo.authorize(request.url);
    demo.failNext('invalid_grant');

    await expect(auth.handleCallback(callbackUrl)).rejects.toMatchObject({ error: 'invalid_grant' });
    expect(auth.check()).toBe(false);
    expect(auth.user()).toBeNull();
  });

  it('con loadUserInfo pide /userinfo con el Bearer y mezcla sus claims en el profile', async () => {
    const auth = makeAuth(memoryStorage(), { userManagerSettings: { loadUserInfo: true } });
    const { result } = await loginAt(auth, demo);

    const userinfo = demo.requests.filter((r) => r.url === `${issuerUrl('demo')}/userinfo`);
    expect(userinfo).toEqual([
      { method: 'GET', url: `${issuerUrl('demo')}/userinfo`, authorization: `Bearer ${result.user.access_token}` }
    ]);
    expect(auth.user()).toMatchObject({ sub: '42', name: 'Ana Prueba', email: 'ana@cliente.test' });
  });
});

describe('protocolo: restore', () => {
  it('sin sesión guardada devuelve null sin pegarle al issuer', async () => {
    const auth = makeAuth(memoryStorage());
    expect(await auth.restore()).toBeNull();
    expect(demo.requests).toHaveLength(0);
    expect(auth.check()).toBe(false);
  });

  it('con la sesión guardada vigente la carga del storage, sin refresh (arranque en frío)', async () => {
    const storage = memoryStorage();
    const { result } = await loginAt(makeAuth(storage), demo);

    const auth = makeAuth(storage);
    const restored = await auth.restore();

    expect(restored?.access_token).toBe(result.user.access_token);
    expect(auth.check()).toBe(true);
    expect(demo.tokenRequests).toHaveLength(1);
    expect(auth.user()).toMatchObject({ sub: '42' });
  });

  it('con el access vencido y refresh token renueva con refresh_token: tokens nuevos y el refresh anterior rota', async () => {
    const storage = memoryStorage();
    const { result: first } = await loginAt(makeAuth(storage), demo);
    vi.setSystemTime(Date.now() + ONE_HOUR + 60_000);

    const auth = makeAuth(storage);
    const expired = vi.fn();
    auth.onSessionExpired(expired);
    const restored = await auth.restore();

    expect(refreshRequests(demo)).toEqual([
      expect.objectContaining({
        url: `${issuerUrl('demo')}/token`,
        refresh_token: first.user.refresh_token,
        client_id: 'histrix-app',
        client_secret: null
      })
    ]);
    expect(restored?.access_token).not.toBe(first.user.access_token);
    expect(restored?.refresh_token).not.toBe(first.user.refresh_token);
    expect(demo.refreshTokens.has(first.user.refresh_token!)).toBe(false);
    expect(demo.refreshTokens.has(restored!.refresh_token!)).toBe(true);
    expect(auth.check()).toBe(true);
    expect(auth.getToken()).toBe(restored!.access_token);
    // Histrix no manda id_token en el refresh: el profile se conserva del login.
    expect(auth.user()).toMatchObject({ sub: '42', name: 'Ana Prueba' });
    expect(JSON.parse(storage.getItem(userKey('demo'))!)).toMatchObject({ refresh_token: restored!.refresh_token });
    expect(expired).not.toHaveBeenCalled();
  });

  it('refresh rechazado (invalid_grant: revocado o ya rotado): null, avisa onSessionExpired y no deja sesión', async () => {
    const storage = memoryStorage();
    await loginAt(makeAuth(storage), demo);
    demo.revokeRefreshTokens();
    vi.setSystemTime(Date.now() + ONE_HOUR + 60_000);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const auth = makeAuth(storage);
    const expired = vi.fn();
    auth.onSessionExpired(expired);

    expect(await auth.restore()).toBeNull();
    expect(refreshRequests(demo)).toHaveLength(1);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(auth.check()).toBe(false);
    expect(auth.getToken()).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      '[oidc] no se pudo renovar la sesión',
      expect.objectContaining({ error: 'invalid_grant' })
    );
  });

  it.each([
    ['un 502 del issuer', 'server_error'],
    ['un error de red', 'network']
  ] as const)(
    'refresh con error transitorio (%s): null sin avisar, y el próximo restore renueva',
    async (_, failure) => {
      const storage = memoryStorage();
      await loginAt(makeAuth(storage), demo);
      vi.setSystemTime(Date.now() + ONE_HOUR + 60_000);
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      demo.failNext(failure);

      const auth = makeAuth(storage);
      const expired = vi.fn();
      auth.onSessionExpired(expired);

      expect(await auth.restore()).toBeNull();
      expect(expired).not.toHaveBeenCalled();

      const restored = await auth.restore();
      expect(restored).not.toBeNull();
      expect(auth.check()).toBe(true);
      expect(refreshRequests(demo)).toHaveLength(2);
    }
  );
});

describe('protocolo: renew y rotación del refresh token', () => {
  it('cada renew usa el refresh vigente y el anterior deja de servir', async () => {
    const auth = makeAuth(memoryStorage());
    const { result } = await loginAt(auth, demo);

    const second = await auth.renew();
    const third = await auth.renew();

    expect(refreshRequests(demo).map((r) => r.refresh_token)).toEqual([
      result.user.refresh_token,
      second!.refresh_token
    ]);
    expect(demo.refreshTokens.has(result.user.refresh_token!)).toBe(false);
    expect(demo.refreshTokens.has(second!.refresh_token!)).toBe(false);
    expect(demo.refreshTokens.has(third!.refresh_token!)).toBe(true);
    expect(auth.getToken()).toBe(third!.access_token);
  });

  it('dos renew a la vez comparten un solo pedido al token endpoint (no se gasta dos veces el mismo refresh)', async () => {
    const auth = makeAuth(memoryStorage());
    await loginAt(auth, demo);

    const [a, b] = await Promise.all([auth.renew(), auth.renew()]);

    expect(refreshRequests(demo)).toHaveLength(1);
    expect(a!.access_token).toBe(b!.access_token);
    expect(auth.check()).toBe(true);
  });

  it('un refresh viejo (otra pestaña con tokens desactualizados) es invalid_grant y descarta la sesión', async () => {
    const storage = memoryStorage();
    const auth = makeAuth(storage);
    const { result } = await loginAt(auth, demo);
    const stale = storage.getItem(userKey('demo'))!;
    await auth.renew();
    // La otra pestaña pisa el storage con la sesión anterior y quiere renovar con el refresh ya rotado.
    storage.setItem(userKey('demo'), stale);
    const expired = vi.fn();
    auth.onSessionExpired(expired);

    await expect(auth.renew()).rejects.toMatchObject({ error: 'invalid_grant' });
    expect(refreshRequests(demo).at(-1)?.refresh_token).toBe(result.user.refresh_token);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(auth.check()).toBe(false);
  });
});

describe('protocolo: 401 → refresh → reintento con attachOidcHttp', () => {
  const calls: InternalAxiosRequestConfig[] = [];
  /** API de Histrix: 200 con un access token que el issuer conoce, 401 con cualquier otro. */
  const adapter: AxiosAdapter = async (config) => {
    calls.push({ ...config, headers: new AxiosHeaders(config.headers) });
    const header = String(config.headers.Authorization ?? '');
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    const response = { data: { usuario: 'ana' }, status: 200, statusText: 'OK', headers: {}, config, request: {} };
    if (demo.accessTokens.has(token)) return response;
    throw new AxiosError(
      'Unauthorized',
      AxiosError.ERR_BAD_REQUEST,
      config,
      {},
      { ...response, status: 401, data: {} }
    );
  };
  const bearerOf = (config: InternalAxiosRequestConfig) => String(config.headers.Authorization).slice('Bearer '.length);

  beforeEach(() => {
    calls.length = 0;
  });

  it('la API rechaza el access token: un refresh real y el reintento sale con el token nuevo', async () => {
    const auth = makeAuth(memoryStorage());
    const { result } = await loginAt(auth, demo);
    const http = axios.create({ baseURL: issuerUrl('demo'), adapter });
    attachOidcHttp(http, auth);
    // El servidor invalidó el access token (venció, se revocó): el próximo pedido da 401.
    demo.revokeAccessTokens();

    const response = await http.get('/me');

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(bearerOf(calls[0]!)).toBe(result.user.access_token);
    expect(refreshRequests(demo)).toEqual([expect.objectContaining({ refresh_token: result.user.refresh_token })]);
    expect(bearerOf(calls[1]!)).toBe(auth.getToken());
    expect(demo.accessTokens.has(bearerOf(calls[1]!))).toBe(true);
    expect(auth.check()).toBe(true);
  });

  it('con el refresh también rechazado, a la app le llega el 401 original y la sesión se descarta', async () => {
    const auth = makeAuth(memoryStorage());
    await loginAt(auth, demo);
    const http = axios.create({ baseURL: issuerUrl('demo'), adapter });
    attachOidcHttp(http, auth);
    const expired = vi.fn();
    auth.onSessionExpired(expired);
    demo.revokeAccessTokens();
    demo.revokeRefreshTokens();

    await expect(http.get('/me')).rejects.toMatchObject({ response: { status: 401 } });

    expect(calls).toHaveLength(1);
    expect(refreshRequests(demo)).toHaveLength(1);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(auth.check()).toBe(false);
  });
});

describe('protocolo: cambio de issuer en runtime (multi-tenant)', () => {
  let otra: FakeIssuer;

  beforeEach(() => {
    otra = createFakeIssuer({
      issuer: issuerUrl('otra'),
      redirectUri: `${APP}/callback`,
      claims: { sub: '7', name: 'Beto' }
    });
    restoreFetch = stubFetch(demo, otra);
  });

  it('setIssuer: discovery y token del tenant nuevo, y la sesión del anterior se recupera al volver', async () => {
    const storage = memoryStorage();
    const auth = makeAuth(storage);
    const { result: enDemo } = await loginAt(auth, demo);

    auth.setIssuer(tenant('otra'));
    expect(auth.getIssuer()).toBe(issuerUrl('otra'));
    expect(auth.check()).toBe(false);
    expect(auth.user()).toBeNull();
    // Sin sesión guardada para el tenant nuevo: ni discovery ni token.
    expect(await auth.restore()).toBeNull();
    expect(otra.requests).toHaveLength(0);

    const { authorizeUrl, result: enOtra } = await loginAt(auth, otra);
    expect(authorizeUrl.startsWith(`${issuerUrl('otra')}/authorize?`)).toBe(true);
    expect(otra.discoveryCount()).toBe(1);
    expect(otra.tokenRequests).toHaveLength(1);
    expect(demo.tokenRequests).toHaveLength(1);
    expect(auth.user()).toMatchObject({ sub: '7', name: 'Beto' });
    expect(storage.getItem(userKey('otra'))).not.toBeNull();
    expect(storage.getItem(userKey('demo'))).not.toBeNull();

    // Un renew ahora va al token endpoint de `otra`, con su refresh token.
    await auth.renew();
    expect(refreshRequests(otra)).toEqual([expect.objectContaining({ refresh_token: enOtra.user.refresh_token })]);
    expect(refreshRequests(demo)).toHaveLength(0);

    // Volver al tenant anterior reutiliza su manager y encuentra su sesión guardada, sin pedir nada.
    auth.setIssuer(tenant('demo'));
    expect(auth.check()).toBe(false);
    const restored = await auth.restore();
    expect(restored?.access_token).toBe(enDemo.user.access_token);
    expect(auth.check()).toBe(true);
    expect(demo.discoveryCount()).toBe(1);
    expect(demo.tokenRequests).toHaveLength(1);
  });

  it('con la sesión del tenant anterior vencida, al volver la renueva contra su propio token endpoint', async () => {
    const storage = memoryStorage();
    const auth = makeAuth(storage);
    const { result: enDemo } = await loginAt(auth, demo);
    auth.setIssuer(tenant('otra'));
    await loginAt(auth, otra);
    vi.setSystemTime(Date.now() + ONE_HOUR + 60_000);

    auth.setIssuer(tenant('demo'));
    const restored = await auth.restore();

    expect(refreshRequests(demo)).toEqual([expect.objectContaining({ refresh_token: enDemo.user.refresh_token })]);
    expect(refreshRequests(otra)).toHaveLength(0);
    expect(restored?.access_token).not.toBe(enDemo.user.access_token);
    expect(auth.check()).toBe(true);
  });
});

describe('protocolo: logout', () => {
  it('sin end_session en el discovery borra la sesión guardada: el próximo restore da null', async () => {
    const storage = memoryStorage();
    const auth = makeAuth(storage);
    await loginAt(auth, demo);

    await auth.logout({ redirect: '/' });

    expect(storage.getItem(userKey('demo'))).toBeNull();
    expect(auth.check()).toBe(false);
    expect(await makeAuth(storage).restore()).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, watchEffect } from 'vue';
import { type RouterLike, VueAuthPlugin, getAuthInstance, install, useAuth } from './index';
import { createHttp, httpError, memoryStorage } from './test-utils';

const USER = { id: 1, name: 'Ana' };

function setup(initial: Record<string, string> = {}, router?: RouterLike) {
  const http = createHttp((request) => {
    if (request.url === '/token') return { access_token: 'token-1', refresh_token: 'refresh-1', expires_in: 3600 };
    if (!request.headers.Authorization) throw httpError(401);
    return USER;
  });
  const app = createApp({ render: () => null });
  // Forma del boot de 1.x: { plugins: { http, router } }
  app.use(install, {
    plugins: { http, router },
    storage: memoryStorage(initial),
    endpoints: { login: '/token', me: '/me', logout: null }
  });
  return { app, http, $auth: app.config.globalProperties.$auth };
}

describe('adaptador Vue', () => {
  it('expone $auth con la superficie de 1.x', async () => {
    const { $auth } = setup();
    await $auth.load();

    expect($auth.check()).toBe(false);
    expect($auth.ready()).toBe(true);
    expect(typeof $auth.redirect).toBe('function');

    await $auth.login({ data: { username: 'ana', password: 'secret' } });
    expect($auth.check()).toBe(true);
    expect($auth.user()).toEqual(USER);
    expect($auth.token()).toBe('token-1');

    await $auth.logout();
    expect($auth.check()).toBe(false);
    expect($auth.user()).toBeNull();
    $auth.service.destroy();
  });

  it('check() y user() son reactivos', async () => {
    const { $auth } = setup();
    const seen: boolean[] = [];
    watchEffect(() => seen.push($auth.check()));

    await $auth.login({ data: { username: 'ana', password: 'secret' }, fetchUser: false });
    $auth.user({ id: 2, name: 'Beto' });
    await nextTick();

    expect(seen).toEqual([false, true]);
    expect($auth.currentUser.value).toEqual({ id: 2, name: 'Beto' });
    $auth.service.destroy();
  });

  it('useAuth() devuelve la misma instancia dentro y fuera de un componente', () => {
    const { app, $auth } = setup();

    expect(app.runWithContext(() => useAuth())).toBe($auth);
    expect(useAuth()).toBe($auth);
    expect(getAuthInstance()).toBe($auth);
    $auth.service.destroy();
  });

  it('restaura la sesión al instalarse', async () => {
    const { $auth } = setup({ accessToken: 'token-0', refreshToken: 'refresh-0' });

    await $auth.load();

    expect($auth.check()).toBe(true);
    expect($auth.user('name')).toBe('Ana');
    $auth.service.destroy();
  });

  it('con router: guard de meta.auth, redirect() y logout({ redirect }) con push', async () => {
    let guard: (to: any, from: any) => unknown = () => undefined;
    const router = {
      push: vi.fn(),
      beforeEach: (fn: typeof guard) => {
        guard = fn;
      }
    };
    const { $auth } = setup({}, router);

    const to = { path: '/privado', matched: [{ meta: { auth: true } }] };
    await expect(guard(to, { path: '/' })).resolves.toBe('/login');
    expect($auth.redirect()).toEqual({ from: { path: '/' }, to });
    await expect(guard({ path: '/publico', matched: [{ meta: {} }] }, to)).resolves.toBeUndefined();

    await $auth.login({ data: { username: 'ana', password: 'secret' } });
    await expect(guard(to, { path: '/' })).resolves.toBeUndefined();

    await $auth.logout({ redirect: '/f-login' });
    expect(router.push).toHaveBeenCalledWith('/f-login');
    $auth.service.destroy();
  });

  it('sin http falla con un mensaje claro', () => {
    expect(() => createApp({}).use(VueAuthPlugin)).toThrow('Falta el cliente http');
  });
});

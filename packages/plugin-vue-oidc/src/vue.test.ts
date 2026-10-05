import { describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, watchEffect } from 'vue';
import { OidcPlugin, getOidcInstance, useOidc, useOidcSession } from './index';
import { fakeAuth, fakeOidcUser, fakeRouter } from './test-utils';

function setup(options: Partial<Parameters<typeof OidcPlugin.install>[1]> = {}) {
  const auth = fakeAuth();
  const app = createApp({ render: () => null });
  app.use(OidcPlugin, { auth, ...options });
  return { app, auth, $oidc: app.config.globalProperties.$oidc };
}

describe('OidcPlugin', () => {
  it('provee $oidc con la forma de useHistrixSession y restaura al instalar', async () => {
    const { auth, $oidc } = setup();
    expect(auth.restore).toHaveBeenCalledTimes(1);
    expect($oidc.auth).toBe(auth);
    await $oidc.restoring();
    expect($oidc.ready.value).toBe(true);
    expect($oidc.isLogged.value).toBe(false);
    expect($oidc.user.value).toBeNull();
  });

  it('user e isLogged son reactivos a onUserChange y a la sesión expirada', async () => {
    const onSessionExpired = vi.fn();
    const { auth, $oidc } = setup({ onSessionExpired });
    const seen: boolean[] = [];
    watchEffect(() => seen.push($oidc.isLogged.value));

    auth.setSession(fakeOidcUser());
    await nextTick();
    expect($oidc.user.value).toEqual({ sub: '42', name: 'Ana' });
    auth.setUser({ id: 7 });
    await nextTick();
    expect($oidc.user.value).toEqual({ id: 7 });

    auth.expire();
    await nextTick();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    // El usuario de la app sigue en storage, pero sin token no hay sesión.
    expect($oidc.user.value).toEqual({ id: 7 });
    expect(seen).toEqual([false, true, false]);
  });

  it('useOidc()/useOidcSession() devuelven la misma instancia dentro y fuera de un componente', () => {
    const { app, $oidc } = setup();
    expect(app.runWithContext(() => useOidc())).toBe($oidc);
    expect(useOidcSession()).toBe($oidc);
    expect(getOidcInstance()).toBe($oidc);
  });

  it('login toma el ?redirect= de la ruta actual si es una ruta de la app', () => {
    const router = fakeRouter({ query: { redirect: '/privado?x=1' } });
    const { auth, $oidc } = setup({ router });
    void $oidc.login();
    expect(auth.login).toHaveBeenLastCalledWith({ redirect: '/privado?x=1' });

    void $oidc.login({ redirect: '/otro' });
    expect(auth.login).toHaveBeenLastCalledWith({ redirect: '/otro' });

    router.currentRoute.value.query = { redirect: '//evil.com' };
    void $oidc.login();
    expect(auth.login).toHaveBeenLastCalledWith({ redirect: undefined });
  });

  it('con router: logout navega con router.push y se instala el guard', async () => {
    const router = fakeRouter();
    const { auth, $oidc } = setup({ router });
    expect(router.beforeEach).toHaveBeenCalledTimes(1);

    auth.setSession(fakeOidcUser());
    await $oidc.logout({ redirect: '/f-login' });
    expect(router.push).toHaveBeenCalledWith('/f-login');
    expect($oidc.isLogged.value).toBe(false);
  });

  it('guard: false y restore: false apagan el guard y el restore inicial', () => {
    const router = fakeRouter();
    const { auth, $oidc } = setup({ router, guard: false, restore: false });
    expect(router.beforeEach).not.toHaveBeenCalled();
    expect(auth.restore).not.toHaveBeenCalled();
    expect($oidc.ready.value).toBe(true);
  });

  it('restore(): ready baja hasta que termina la última llamada y el guard espera esa promesa', async () => {
    const { auth, $oidc } = setup({ restore: false });
    const first = auth.deferRestore();
    const p1 = $oidc.restore();
    expect($oidc.ready.value).toBe(false);
    expect($oidc.restoring()).toBe(p1);

    first.resolve(fakeOidcUser());
    await p1;
    expect($oidc.ready.value).toBe(true);
    expect($oidc.isLogged.value).toBe(true);
  });

  it('un restore que rechaza no tira: deja la sesión como está y ready en true', async () => {
    const { auth, $oidc } = setup({ restore: false });
    auth.restore.mockRejectedValueOnce(new Error('offline'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await $oidc.restore()).toBeNull();
    expect($oidc.ready.value).toBe(true);
    warn.mockRestore();
  });

  it('globalProperty: false no registra $oidc; sin auth falla con un mensaje claro', () => {
    const { app } = setup({ globalProperty: false });
    expect(app.config.globalProperties.$oidc).toBeUndefined();
    expect(() => createApp({}).use(OidcPlugin, {} as any)).toThrow('Falta `auth`');
    expect(() => useOidc()).not.toThrow();
  });
});

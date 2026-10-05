import { describe, expect, it } from 'vitest';
import { createOidcGuard, createVueOidc } from './index';
import { fakeAuth, fakeOidcUser, route } from './test-utils';

function setup() {
  const auth = fakeAuth();
  const oidc = createVueOidc(auth);
  return { auth, oidc };
}

describe('createOidcGuard', () => {
  it('las rutas con meta.public pasan sin esperar el restore', async () => {
    const { auth, oidc } = setup();
    auth.deferRestore();
    void oidc.restore();
    const guard = createOidcGuard(oidc);
    expect(await guard(route('/connect', { public: true }))).toBe(true);
    expect(await guard(route('/login'))).toBe(true);
  });

  it('sin sesión manda al login con query.redirect = fullPath', async () => {
    const { oidc } = setup();
    const guard = createOidcGuard(oidc);
    expect(await guard(route('/privado', {}, { fullPath: '/privado?x=1' }))).toEqual({
      path: '/login',
      query: { redirect: '/privado?x=1' }
    });
  });

  it('con sesión pasa', async () => {
    const { auth, oidc } = setup();
    auth.setSession(fakeOidcUser());
    expect(await createOidcGuard(oidc)(route('/privado'))).toBe(true);
  });

  it('la navegación inicial espera el restore() en curso antes de decidir', async () => {
    const { auth, oidc } = setup();
    const pending = auth.deferRestore();
    void oidc.restore();
    const guard = createOidcGuard(oidc);

    let decided: unknown = 'sin decidir';
    const navigation = guard(route('/privado')).then((r) => (decided = r));
    await Promise.resolve();
    expect(decided).toBe('sin decidir');

    pending.resolve(fakeOidcUser());
    await navigation;
    expect(decided).toBe(true);
  });

  it('loginRoute como objeto con name: mezcla la query y trata esa ruta como pública', async () => {
    const { oidc } = setup();
    const guard = createOidcGuard(oidc, { loginRoute: { name: 'login', query: { tab: 'a' } } });
    expect(await guard(route('/privado'))).toEqual({ name: 'login', query: { tab: 'a', redirect: '/privado' } });
    expect(await guard(route('/ingresar', {}, { name: 'login' }))).toBe(true);
  });

  it('loginRoute como función de la ruta bloqueada y publicMeta propio', async () => {
    const { oidc } = setup();
    const guard = createOidcGuard(oidc, {
      loginRoute: (to) => `/login/${String(to.meta?.tenant ?? 'x')}`,
      publicMeta: 'anon'
    });
    expect(await guard(route('/privado', { tenant: 't1' }))).toEqual({
      path: '/login/t1',
      query: { redirect: '/privado' }
    });
    expect(await guard(route('/libre', { anon: true }))).toBe(true);
    expect(await guard(route('/libre', { public: true }))).toEqual({ path: '/login/x', query: { redirect: '/libre' } });
  });

  it('la ruta del redirectUri del manager pasa sin sesión (la vuelta del authorize no tiene sesión todavía)', async () => {
    const { auth, oidc } = setup();
    auth.deferRestore();
    void oidc.restore();
    const guard = createOidcGuard(oidc);
    expect(await guard(route('/callback', {}, { fullPath: '/callback?code=1&state=2' }))).toBe(true);
  });

  it('callbackRoute: propia, o false para no eximir ninguna; sin manager no exime nada', async () => {
    const { auth, oidc } = setup();
    expect(await createOidcGuard(oidc, { callbackRoute: '/oidc/vuelta' })(route('/oidc/vuelta'))).toBe(true);
    expect(await createOidcGuard(oidc, { callbackRoute: '/oidc/vuelta' })(route('/callback'))).not.toBe(true);
    expect(await createOidcGuard(oidc, { callbackRoute: false })(route('/callback'))).not.toBe(true);
    auth.getUserManager = () => null;
    expect(await createOidcGuard(oidc)(route('/callback'))).not.toBe(true);
  });

  it('mira meta en todos los records de matched (rutas anidadas)', async () => {
    const { oidc } = setup();
    const guard = createOidcGuard(oidc);
    const nested = { ...route('/pub/hija'), matched: [{ meta: { public: true } }, { meta: {} }] };
    expect(await guard(nested)).toBe(true);
  });
});

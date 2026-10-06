import type { HistrixUser as AxiosHistrixUser } from '@mundoit-lib/plugin-vue-axios/http';
import type { User, UserManager } from 'oidc-client-ts';
import { describe, expectTypeOf, it } from 'vitest';
import { type ComputedRef, type ShallowRef, createApp } from 'vue';
import { OidcPlugin, createOidcAuth, createOidcGuard, useOidc, useOidcSession } from './index';
import type {
  HistrixAuthContract,
  OidcAuth,
  OidcCallbackResult,
  OidcUser,
  RouteLike,
  RouteTarget,
  RouterLike,
  VueOidc
} from './index';

describe('tipos de plugin-vue-oidc', () => {
  it('createOidcAuth devuelve un OidcAuth que cumple el contrato de auth de histrix-component-vue', () => {
    const auth = createOidcAuth<{ id: number }>({ issuer: { host: 'https://h', db: 'x' } });
    expectTypeOf(auth).toEqualTypeOf<OidcAuth<{ id: number }>>();
    expectTypeOf(auth).toExtend<HistrixAuthContract<{ id: number }>>();
    expectTypeOf(auth.user()).toEqualTypeOf<{ id: number } | null>();
    expectTypeOf(auth.getToken()).toEqualTypeOf<string | null>();
    expectTypeOf(auth.token()).toEqualTypeOf<string | null>();
    expectTypeOf(auth.check()).toBeBoolean();
    expectTypeOf(auth.onUserChange((u) => u?.id)).toEqualTypeOf<() => void>();
  });

  it('la forma del AuthService 2.x para apps a medida: onUserChange + token()', () => {
    const auth = createOidcAuth();
    expectTypeOf(auth).toHaveProperty('onUserChange');
    expectTypeOf(auth).toHaveProperty('token');
    expectTypeOf(auth.__histrixAuth).toEqualTypeOf<true>();
  });

  it('flujo OIDC tipado', async () => {
    const auth = createOidcAuth();
    expectTypeOf(auth.login({ redirect: '/x' })).toEqualTypeOf<Promise<never>>();
    expectTypeOf(await auth.handleCallback()).toEqualTypeOf<OidcCallbackResult>();
    expectTypeOf(await auth.restore()).toEqualTypeOf<OidcUser | null>();
    expectTypeOf(await auth.renew()).toEqualTypeOf<User | null>();
    expectTypeOf(auth.getUserManager()).toEqualTypeOf<UserManager | null>();
    auth.setIssuer({ host: 'https://h', db: 'x' });
    auth.setIssuer('https://h/api/db/x');
    auth.setIssuer(null);
    // @ts-expect-error el tenant necesita host y db
    auth.setIssuer({ host: 'https://h' });
  });

  it('el user por defecto es el HistrixUser de /me (plugin-vue-axios/http)', () => {
    expectTypeOf(createOidcAuth().user()).toEqualTypeOf<AxiosHistrixUser | null>();
  });
});

describe('tipos de la capa Vue', () => {
  it('useOidcSession tiene la forma de useHistrixSession: user, isLogged, login, logout', () => {
    const session = useOidcSession<{ id: number }>();
    expectTypeOf(session.user).toEqualTypeOf<ShallowRef<{ id: number } | null>>();
    expectTypeOf(session.isLogged).toEqualTypeOf<ComputedRef<boolean>>();
    expectTypeOf(session.login({ redirect: '/x' })).toEqualTypeOf<Promise<never>>();
    expectTypeOf(session.logout({ redirect: '/login' })).toEqualTypeOf<Promise<void>>();
    expectTypeOf(session.renew()).toEqualTypeOf<Promise<OidcUser | null>>();
    expectTypeOf(session.auth).toEqualTypeOf<OidcAuth<{ id: number }>>();
    expectTypeOf(useOidc()).toEqualTypeOf<VueOidc>();
  });

  it('el guard devuelve lo que vue-router acepta de un beforeEach', () => {
    const guard = createOidcGuard(useOidc(), { loginRoute: { name: 'login' }, publicMeta: 'public' });
    expectTypeOf(guard).parameter(0).toExtend<RouteLike>();
    expectTypeOf(guard).returns.resolves.toEqualTypeOf<RouteTarget | true>();
    // @ts-expect-error publicMeta es la key de meta, no un booleano
    createOidcGuard(useOidc(), { publicMeta: true });
  });

  it('el plugin exige auth y acepta un router estructural', () => {
    const router: RouterLike = { push() {}, replace() {}, beforeEach() {} };
    expectTypeOf(
      OidcPlugin.install(createApp({}), { auth: createOidcAuth(), router, loginRoute: '/login' })
    ).toBeVoid();
    // @ts-expect-error auth es obligatorio
    OidcPlugin.install(createApp({}), { router });
  });
});

import type { User, UserManager } from 'oidc-client-ts';
import { describe, expectTypeOf, it } from 'vitest';
import { createOidcAuth } from './index';
import type { HistrixAuthContract, OidcAuth, OidcCallbackResult, OidcUser } from './index';

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

  it('el user por defecto es un objeto genérico', () => {
    expectTypeOf(createOidcAuth().user()).toEqualTypeOf<Record<string, unknown> | null>();
  });
});

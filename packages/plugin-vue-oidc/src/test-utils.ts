import { type Mock, vi } from 'vitest';
import type { OidcAuth, OidcUser, RouteLike, RouterLike } from './types';

export function fakeOidcUser(overrides: Partial<Record<keyof OidcUser, unknown>> = {}): OidcUser {
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

type BaseAuth = OidcAuth<Record<string, unknown>>;
type Mocked = 'navigate' | 'login' | 'handleCallback' | 'restore' | 'renew' | 'logout' | 'setIssuer';

export type FakeAuth = Omit<BaseAuth, Mocked> & { [K in Mocked]: Mock<BaseAuth[K]> } & {
  /** Simula una sesión que entra (login/restore) o se va (null). */
  setSession(user: OidcUser | null): void;
  /** Simula el vencimiento sin renovación. */
  expire(): void;
  deferRestore(): { resolve(user?: OidcUser | null): void };
};

/** Doble del núcleo (`createOidcAuth`) para testear la capa Vue sin oidc-client-ts. */
export function fakeAuth(): FakeAuth {
  let session: OidcUser | null = null;
  let appUser: Record<string, unknown> | null = null;
  const userListeners = new Set<(u: Record<string, unknown> | null) => void>();
  const expiredListeners = new Set<() => void>();
  let pendingRestore: ((user: OidcUser | null) => void) | null = null;

  const user = () => appUser ?? (session?.profile as Record<string, unknown> | undefined) ?? null;
  const notify = () => {
    for (const cb of userListeners) cb(user());
  };

  const auth: FakeAuth = {
    __histrixAuth: true,
    navigate: vi.fn(),
    login: vi.fn(async () => new Promise<never>(() => {})),
    handleCallback: vi.fn(async () => {
      const u = fakeOidcUser({ state: { redirect: '/destino' } });
      auth.setSession(u);
      return { user: u, redirect: '/destino' };
    }),
    restore: vi.fn(
      () =>
        new Promise<OidcUser | null>((resolve) => {
          if (pendingRestore === null) {
            resolve(session);
            return;
          }
          const original = pendingRestore;
          pendingRestore = (u) => {
            auth.setSession(u);
            resolve(u);
            original(u);
          };
        })
    ),
    renew: vi.fn(async () => session),
    logout: vi.fn(async (options) => {
      appUser = null;
      session = null;
      notify();
      if (typeof options?.redirect === 'string') auth.navigate(options.redirect);
    }),
    getToken: () => session?.access_token ?? null,
    token: () => session?.access_token ?? null,
    user,
    setUser: (u) => {
      appUser = u;
      notify();
    },
    check: () => session !== null,
    onUserChange: (cb) => {
      userListeners.add(cb);
      return () => void userListeners.delete(cb);
    },
    onSessionExpired: (cb) => {
      expiredListeners.add(cb);
      return () => void expiredListeners.delete(cb);
    },
    setIssuer: vi.fn(),
    getIssuer: () => 'https://h/api/db/x',
    getUserManager: () => ({ settings: { redirect_uri: 'https://app.test/callback' } }) as any,

    setSession(u) {
      session = u;
      notify();
    },
    expire() {
      session = null;
      notify();
      for (const cb of expiredListeners) cb();
    },
    deferRestore() {
      pendingRestore = () => {};
      return {
        resolve: (u = null) => {
          const resolver = pendingRestore;
          pendingRestore = null;
          resolver?.(u);
        }
      };
    }
  };
  return auth;
}

export function fakeRouter(route: Partial<RouteLike> = {}) {
  const guards: Array<(to: RouteLike, from: RouteLike) => unknown> = [];
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    beforeEach: vi.fn((guard: (to: RouteLike, from: RouteLike) => unknown) => {
      guards.push(guard);
    }),
    currentRoute: { value: { path: '/', fullPath: '/', query: {}, meta: {}, matched: [], ...route } as RouteLike },
    guards
  } satisfies RouterLike & { guards: unknown };
  return router;
}

export const route = (path: string, meta: Record<string, unknown> = {}, extra: Partial<RouteLike> = {}): RouteLike => ({
  path,
  fullPath: path,
  query: {},
  meta,
  matched: [{ meta }],
  ...extra
});

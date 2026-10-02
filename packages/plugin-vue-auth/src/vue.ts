import {
  type App,
  type ComputedRef,
  type InjectionKey,
  type ShallowRef,
  computed,
  getCurrentInstance,
  inject,
  shallowRef
} from 'vue';
import { AuthService } from './AuthService';
import type { AuthOptions, HttpClient, LoginOptions, LogoutOptions, RedirectTarget, TokenResponse } from './types';

/** Lo que usa el adaptador de vue-router (sin depender del paquete). */
export interface RouterLike {
  push(to: any): unknown;
  beforeEach(guard: (to: any, from: any) => unknown): unknown;
}

export interface VueAuthOptions extends AuthOptions {
  http?: HttpClient;
  router?: RouterLike;
  /** @deprecated Se elimina en 3.0. Usar `{ http, router }` (forma 1.x `{ plugins: { http, router } }`). */
  plugins?: { http?: HttpClient; router?: RouterLike };
  /** A dónde manda el guard de `meta.auth` sin sesión. Por defecto `/login`. */
  authRedirect?: RedirectTarget;
}

export interface AuthRedirect {
  from: unknown;
  to: unknown;
}

/** `$auth` y `useAuth()`: la superficie de 1.x, reactiva. */
export interface VueAuth<TUser = Record<string, unknown>> {
  readonly service: AuthService<TUser>;
  readonly currentUser: ShallowRef<TUser | null>;
  readonly isAuthenticated: ComputedRef<boolean>;
  check(): boolean;
  user(): TUser | null;
  user<K extends keyof TUser>(key: K): TUser[K] | undefined;
  user(user: TUser | null): TUser | null;
  login(options: LoginOptions): Promise<{ data: TokenResponse }>;
  logout(options?: LogoutOptions): Promise<void>;
  /** Último destino que bloqueó el guard de `meta.auth`, o `null`. */
  redirect(): AuthRedirect | null;
  ready(): boolean;
  load(): Promise<boolean>;
  token(): string | null;
  fetch(): Promise<TUser>;
}

export const AUTH_KEY: InjectionKey<VueAuth<any>> = Symbol('mundoitVueAuth');

let current: VueAuth<any> | null = null;

export function createVueAuth<TUser>(
  service: AuthService<TUser>,
  { router, authRedirect = '/login' }: Pick<VueAuthOptions, 'router' | 'authRedirect'> = {}
): VueAuth<TUser> {
  const currentUser = shallowRef<TUser | null>(service.user());
  const authState = shallowRef(service.check());
  const isAuthenticated = computed(() => authState.value);
  const loaded = shallowRef(service.ready());
  let lastRedirect: AuthRedirect | null = null;

  service.on('user', (user) => {
    currentUser.value = user;
    authState.value = service.check();
  });
  service.on('auth', (value) => {
    authState.value = value;
  });

  if (router) {
    service.navigate = (target) => {
      if (target) router.push(target);
    };
    router.beforeEach(async (to, from) => {
      if (!requiresAuth(to)) return;
      await service.load();
      if (service.check()) return;
      lastRedirect = { from, to };
      return authRedirect ?? false;
    });
  }

  const auth: VueAuth<TUser> = {
    service,
    currentUser,
    isAuthenticated,
    check: () => isAuthenticated.value,
    user: ((arg?: unknown) => {
      if (arg === undefined) return currentUser.value;
      return service.user(arg as any);
    }) as VueAuth<TUser>['user'],
    login: (options) => service.login(options),
    logout: (options) => service.logout(options),
    redirect: () => lastRedirect,
    ready: () => loaded.value,
    load: () =>
      service.load().finally(() => {
        loaded.value = true;
      }),
    token: () => service.token(),
    fetch: () => service.fetchUser()
  };
  return auth;
}

/** Rutas con `meta.auth` (true, rol o lista de roles) piden sesión; los roles no se validan. */
function requiresAuth(route: any): boolean {
  const records: any[] = route?.matched?.length ? route.matched : [route];
  return records.some((record) => {
    const value = record?.meta?.auth;
    return value !== undefined && value !== null && value !== false;
  });
}

export const VueAuthPlugin = {
  install(app: App, options: VueAuthOptions = {}): void {
    const { http, router, plugins, authRedirect, ...config } = options;
    const client = http ?? plugins?.http;
    if (!client) {
      throw new Error('[Auth] Falta el cliente http: app.use(auth, { http: getAxiosInstance(), ... })');
    }

    const service = new AuthService({ ...config, http: client });
    const auth = createVueAuth(service, { router: router ?? plugins?.router, authRedirect });
    current = auth;

    app.config.globalProperties.$auth = auth;
    app.provide(AUTH_KEY, auth);
    app.provide('mundoitAuth', service);
    void auth.load();
  }
};

export function useAuth<TUser = Record<string, unknown>>(): VueAuth<TUser> {
  const auth = (getCurrentInstance() ? inject(AUTH_KEY, null) : null) ?? current;
  if (!auth) throw new Error('[Auth] No inicializado: falta app.use(VueAuthPlugin) antes de useAuth()');
  return auth;
}

export function getAuthInstance<TUser = Record<string, unknown>>(): VueAuth<TUser> | null {
  return current;
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $auth: VueAuth;
  }
}

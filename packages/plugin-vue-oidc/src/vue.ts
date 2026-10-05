import { type App, type InjectionKey, computed, getCurrentInstance, inject, shallowRef } from 'vue';
import { createOidcGuard } from './guard';
import { isAppPath } from './OidcAuth';
import type { OidcAuth, OidcPluginOptions, RouterLike, VueOidc, VueOidcLoginOptions } from './types';

export const OIDC_KEY: InjectionKey<VueOidc<any>> = Symbol('mundoitVueOidc');

let current: VueOidc<any> | null = null;

/** El `?redirect=` de la ruta actual, si es una ruta de la app (`/...`): lo deja el guard al mandar al login. */
function redirectFromRoute(router: RouterLike | undefined): string | undefined {
  const redirect = router?.currentRoute?.value.query?.redirect;
  return isAppPath(redirect) ? redirect : undefined;
}

/** Envuelve el núcleo con estado reactivo. `OidcPlugin` lo instala; sirve suelto para tests o apps sin plugin. */
export function createVueOidc<TUser>(
  auth: OidcAuth<TUser>,
  { router, onSessionExpired }: Pick<OidcPluginOptions, 'router' | 'onSessionExpired'> = {}
): VueOidc<TUser> {
  const user = shallowRef<TUser | null>(auth.user());
  const logged = shallowRef(auth.check());
  const ready = shallowRef(true);
  let restoring: Promise<unknown> = Promise.resolve();

  const sync = (): void => {
    user.value = auth.user();
    logged.value = auth.check();
  };
  auth.onUserChange(sync);
  auth.onSessionExpired(() => {
    sync();
    onSessionExpired?.();
  });

  if (router) {
    auth.navigate = (target) => {
      if (isAppPath(target)) void router.push(target);
    };
  }

  const oidc: VueOidc<TUser> = {
    auth,
    user,
    isLogged: computed(() => logged.value),
    ready,

    login(options: VueOidcLoginOptions = {}) {
      const redirect =
        typeof options.redirect === 'string' && options.redirect ? options.redirect : redirectFromRoute(router);
      return auth.login({ ...options, redirect });
    },
    logout: (options) => auth.logout(options),
    renew: () => auth.renew().finally(sync),

    restore() {
      ready.value = false;
      const promise = auth
        .restore()
        .catch((error: unknown) => {
          console.warn('[oidc] restore', error);
          return null;
        })
        .finally(() => {
          sync();
          if (restoring === promise) ready.value = true;
        });
      restoring = promise;
      return promise;
    },
    restoring: () => restoring,

    handleCallback: (url) => auth.handleCallback(url).finally(sync)
  };
  return oidc;
}

export const OidcPlugin = {
  install(app: App, options: OidcPluginOptions): void {
    const { auth, router, guard = true, restore = true, globalProperty = '$oidc', ...rest } = options ?? {};
    if (!auth) throw new Error('[oidc] Falta `auth`: app.use(OidcPlugin, { auth: createOidcAuth(...), router })');

    const oidc = createVueOidc(auth, { router, onSessionExpired: rest.onSessionExpired });
    current = oidc;
    app.provide(OIDC_KEY, oidc);
    if (globalProperty) (app.config.globalProperties as Record<string, unknown>)[globalProperty] = oidc;

    // Antes del guard: la navegación inicial (app.use(router)) espera esta promesa, así al recargar no manda a /login.
    if (restore) void oidc.restore();
    if (router && guard) {
      const { loginRoute, publicMeta, callbackRoute } = rest;
      router.beforeEach(createOidcGuard(oidc, { loginRoute, publicMeta, callbackRoute }));
    }
  }
};

/** El `VueOidc` instalado. Funciona fuera de un componente (stores, boot) si el plugin ya se instaló. */
export function useOidc<TUser = Record<string, unknown>>(): VueOidc<TUser> {
  const oidc = (getCurrentInstance() ? inject(OIDC_KEY, null) : null) ?? current;
  if (!oidc) throw new Error('[oidc] No inicializado: falta app.use(OidcPlugin, { auth }) antes de useOidc()');
  return oidc;
}

/** @alias Misma forma que `useHistrixSession()` de histrix-component-vue: `user`, `isLogged`, `login`, `logout`. */
export const useOidcSession = useOidc;

export function getOidcInstance<TUser = Record<string, unknown>>(): VueOidc<TUser> | null {
  return current;
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $oidc: VueOidc;
  }
}

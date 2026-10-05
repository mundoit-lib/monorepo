import type { OidcGuardOptions, RouteLike, RouteTarget, VueOidc } from './types';

const isPublic = (route: RouteLike, publicMeta: string): boolean => {
  const records = route.matched?.length ? route.matched : [route];
  return records.some((record) => Boolean(record.meta?.[publicMeta]));
};

/** Path del `redirect_uri` del manager actual (`https://app/callback` → `/callback`), o `null` sin issuer. */
const callbackPathOf = (oidc: VueOidc<any>): string | null => {
  const uri = oidc.auth.getUserManager()?.settings.redirect_uri;
  if (typeof uri !== 'string') return null;
  try {
    return new URL(uri, 'http://localhost').pathname;
  } catch {
    return null;
  }
};

/** La ruta bloqueada es la del login: mandarla al login sería un loop. */
const isLoginRoute = (route: RouteLike, loginRoute: RouteTarget): boolean => {
  if (typeof loginRoute === 'string') return route.path === loginRoute.split('?')[0];
  if (loginRoute.name !== undefined) return route.name === loginRoute.name;
  return loginRoute.path !== undefined && route.path === loginRoute.path;
};

/**
 * Guard para `router.beforeEach`: las rutas con `meta[publicMeta]`, la de login y la del callback pasan; el resto
 * espera el `restore()` en curso (la navegación inicial de vue-router arranca en `app.use(router)`, antes de saber
 * si hay sesión) y sin sesión manda a `loginRoute` con `query.redirect = to.fullPath`, que `login()` toma como
 * vuelta del callback.
 */
export function createOidcGuard(
  oidc: VueOidc<any>,
  { loginRoute = '/login', publicMeta = 'public', callbackRoute }: OidcGuardOptions = {}
): (to: RouteLike) => Promise<RouteTarget | true> {
  return async (to) => {
    if (isPublic(to, publicMeta)) return true;
    // Se resuelve en cada navegación: el issuer (y su manager) puede fijarse después de instalar el guard.
    const callbackPath = callbackRoute === false ? null : (callbackRoute ?? callbackPathOf(oidc));
    if (callbackPath !== null && to.path === callbackPath) return true;
    const target = typeof loginRoute === 'function' ? loginRoute(to) : loginRoute;
    if (isLoginRoute(to, target)) return true;
    await oidc.restoring();
    if (oidc.isLogged.value) return true;
    if (typeof target === 'string') {
      return { path: target.split('?')[0], query: { redirect: to.fullPath } };
    }
    return { ...target, query: { ...target.query, redirect: to.fullPath } };
  };
}

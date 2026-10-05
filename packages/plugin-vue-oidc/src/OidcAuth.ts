import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { type OidcIssuer, resolveIssuer } from './issuer';
import type {
  OidcAuth,
  OidcAuthOptions,
  OidcCallbackResult,
  OidcLoginCredentials,
  OidcLoginOptions,
  OidcLogoutOptions,
  OidcStorage,
  OidcUser
} from './types';

export const DEFAULT_CLIENT_ID = 'histrix-app';
export const DEFAULT_SCOPE = 'openid profile email offline_access';
const DEFAULT_USER_KEY = 'user';

/** Lo que viaja en `state` del authorize y vuelve en el callback. */
interface LoginState {
  redirect?: string;
}

/** Storage en memoria para entornos sin `localStorage` (tests en node, SSR). */
function memoryStorage(): OidcStorage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (index) => Array.from(map.keys())[index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: (key) => void map.delete(key)
  };
}

const defaultStorage = (): OidcStorage => (typeof localStorage === 'undefined' ? memoryStorage() : localStorage);

const origin = (): string => (typeof window === 'undefined' ? '' : window.location.origin);

/** Ruta relativa al origin de la app: empieza con una sola `/` (ni `//host`, ni esquema, ni `javascript:`). */
const isAppPath = (target: unknown): target is string =>
  typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\');

/** `expired` es `undefined` si el token no trae `expires_at`: se lo trata como vigente. */
const isLive = (user: OidcUser | null): user is OidcUser => Boolean(user && user.expired !== true);

/**
 * Núcleo de auth OIDC sobre `oidc-client-ts`: authorization code + PKCE S256, cliente público sin secret,
 * refresh token con rotación y renovación automática sin iframe. Un `UserManager` por issuer, para cambiar
 * de tenant en runtime. Cumple el contrato de auth de `histrix-component-vue` y la forma `token()` /
 * `onUserChange()` del `AuthService` de plugin-vue-auth 2.x.
 */
export function createOidcAuth<TUser = Record<string, unknown>>(options: OidcAuthOptions = {}): OidcAuth<TUser> {
  const storage = options.storage ?? defaultStorage();
  const userKey = options.userKey ?? DEFAULT_USER_KEY;
  const managers = new Map<string, UserManager>();
  const listeners = new Set<(user: TUser | null) => void>();

  let issuer: string | null = null;
  let manager: UserManager | null = null;
  let session: OidcUser | null = null;
  /** Usuario de la app en memoria; `undefined` = todavía no se leyó del storage. */
  let appUser: TUser | null | undefined;
  let lastNotified: TUser | null | undefined;

  const readStoredUser = (): TUser | null => {
    try {
      const raw = storage.getItem(userKey);
      return raw ? (JSON.parse(raw) as TUser) : null;
    } catch {
      return null;
    }
  };

  const currentUser = (): TUser | null => {
    if (appUser === undefined) appUser = readStoredUser();
    if (appUser) return appUser;
    return session ? (session.profile as TUser) : null;
  };

  const notify = (): void => {
    const user = currentUser();
    if (user === lastNotified) return;
    lastNotified = user;
    for (const cb of Array.from(listeners)) {
      try {
        cb(user);
      } catch (error) {
        console.error(error);
      }
    }
  };

  const setSession = (user: OidcUser | null): void => {
    session = isLive(user) ? user : null;
    notify();
  };

  const createManager = (authority: string): UserManager => {
    const um = new UserManager({
      authority,
      client_id: options.clientId ?? DEFAULT_CLIENT_ID,
      redirect_uri: options.redirectUri ?? `${origin()}/callback`,
      post_logout_redirect_uri: options.postLogoutRedirectUri ?? `${origin()}/`,
      response_type: 'code',
      scope: options.scope ?? DEFAULT_SCOPE,
      // WebStorageStateStore sólo usa getItem/setItem/removeItem/key/length: el Pick alcanza.
      userStore: new WebStorageStateStore({ store: storage as Storage }),
      automaticSilentRenew: true,
      // Sin iframe: renueva siempre con refresh token (en móvil los iframes no sirven) y sin check_session.
      monitorSession: false,
      silentRequestTimeoutInSeconds: 10,
      loadUserInfo: false,
      ...options.userManagerSettings
    });
    // Los eventos de un manager que dejó de ser el actual (cambio de tenant) no tocan la sesión.
    um.events.addUserLoaded((user) => {
      if (um === manager) setSession(user);
    });
    um.events.addUserUnloaded(() => {
      if (um === manager) setSession(null);
    });
    um.events.addSilentRenewError((error) => {
      if (um === manager) console.warn('[oidc] no se pudo renovar la sesión', error);
    });
    return um;
  };

  const requireManager = (): UserManager => {
    if (!manager) throw new Error('OIDC: no hay issuer configurado. Llamá a setIssuer() o pasá `issuer` al crear.');
    return manager;
  };

  /** Borra usuario de la app y sesión OIDC juntos: una sola notificación con null, sin pasar por los claims. */
  const clearLocal = (): void => {
    appUser = null;
    storage.removeItem(userKey);
    session = null;
    notify();
  };

  const setIssuer = (next: OidcIssuer | null): void => {
    const authority = next === null ? null : resolveIssuer(next, options.issuerTemplate);
    if (authority === issuer) return;
    const previous = issuer;
    manager?.stopSilentRenew();
    issuer = authority;
    if (authority === null) {
      manager = null;
    } else {
      let um = managers.get(authority);
      if (!um) {
        um = createManager(authority);
        managers.set(authority, um);
      } else if (um.settings.automaticSilentRenew) {
        um.startSilentRenew();
      }
      manager = um;
    }
    // La key del usuario de la app no depende del issuer: al cambiar de tenant se descarta con la sesión,
    // si no `user()` seguiría devolviendo el usuario del tenant anterior. En la primera asignación (arranque
    // de la app, `createOidcAuth({ issuer })`) no hay tenant anterior: el usuario persistido se conserva.
    if (previous !== null) clearLocal();
  };

  const setUser = (user: TUser | null): void => {
    appUser = user ?? null;
    if (user) storage.setItem(userKey, JSON.stringify(user));
    else storage.removeItem(userKey);
    notify();
  };

  /**
   * Una sola renovación en vuelo por manager. Con rotación de refresh token, dos `signinSilent` a la vez
   * (un 401 mientras corre el `automaticSilentRenew`, dos 401 seguidos) gastarían el mismo refresh token:
   * el segundo falla con `invalid_grant` y se pierde la sesión. oidc-client-ts no lo serializa.
   */
  const renewing = new Map<UserManager, Promise<OidcUser | null>>();
  const renewWith = (um: UserManager): Promise<OidcUser | null> => {
    const inflight = renewing.get(um);
    if (inflight) return inflight;
    const promise = um
      .signinSilent()
      .then((user) => {
        if (um === manager) setSession(user);
        return isLive(user) ? user : null;
      })
      .finally(() => renewing.delete(um));
    renewing.set(um, promise);
    return promise;
  };

  const auth: OidcAuth<TUser> = {
    __histrixAuth: true,

    navigate(target) {
      // Sólo rutas de la app (`/...`, no `//host` ni `javascript:`): el redirect puede venir de un query param.
      if (isAppPath(target) && typeof window !== 'undefined') window.location.href = target;
    },

    async login(loginOptions: OidcLoginOptions | OidcLoginCredentials = {}) {
      const { redirect } = loginOptions;
      const state: LoginState = { redirect: typeof redirect === 'string' && redirect ? redirect : '/' };
      await requireManager().signinRedirect({ state });
      // La página navega al authorize: el que espera no tiene que seguir (ni navegar, ni mostrar "login ok").
      return new Promise<never>(() => {});
    },

    async handleCallback(url?: string): Promise<OidcCallbackResult> {
      const um = requireManager();
      const user = await um.signinRedirectCallback(url);
      setSession(user);
      const state = (user.state ?? {}) as LoginState;
      return { user, redirect: state.redirect || '/' };
    },

    async restore() {
      if (!manager) return null;
      const um = manager;
      let user = await um.getUser();
      if (user?.expired && user.refresh_token) {
        try {
          return await renewWith(um);
        } catch (error) {
          console.warn('[oidc] no se pudo renovar la sesión', error);
          user = null;
        }
      }
      if (um === manager) setSession(user);
      return isLive(user) ? user : null;
    },

    async renew() {
      if (!manager) return null;
      return renewWith(manager);
    },

    async logout(logoutOptions: OidcLogoutOptions = {}) {
      const um = manager;
      clearLocal();
      if (!um) return;
      const endSession = logoutOptions.endSession === false ? undefined : await endSessionEndpoint(um);
      if (endSession) {
        // El issuer tiene end_session: cierra también la sesión del servidor y vuelve a postLogoutRedirectUri.
        await um.signoutRedirect();
        return;
      }
      // Sin end_session ni revocación (Histrix hoy): se tiran los tokens locales.
      await um.removeUser();
      if (typeof logoutOptions.redirect === 'string') auth.navigate(logoutOptions.redirect);
    },

    getToken: () => (session && isLive(session) ? session.access_token : null),
    token: () => auth.getToken(),
    user: currentUser,
    setUser,
    check: () => isLive(session),

    onUserChange(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },

    setIssuer,
    getIssuer: () => issuer,
    getUserManager: () => manager
  };

  if (options.issuer) setIssuer(options.issuer);
  return auth;
}

async function endSessionEndpoint(um: UserManager): Promise<string | undefined> {
  try {
    return await um.metadataService.getEndSessionEndpoint();
  } catch {
    // Sin discovery (offline, issuer caído): logout local.
    return undefined;
  }
}

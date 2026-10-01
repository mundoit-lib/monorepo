import type {
  AuthConfig,
  AuthOptions,
  AuthStorage,
  Endpoint,
  HttpClient,
  HttpRequestConfig,
  LoginOptions,
  LogoutOptions,
  RedirectTarget,
  RegisterData,
  TokenResponse
} from './types';

type AuthEvents<TUser> = {
  user: (user: TUser | null) => void;
  auth: (isAuthenticated: boolean) => void;
  refresh: (token: string) => void;
  refreshError: (error: unknown) => void;
};

/** Marca los requests al endpoint de token: no llevan Bearer ni disparan refresh en 401. */
const SKIP_AUTH = '_skipAuth';

export const localStorageAdapter: AuthStorage = {
  get: (key) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(key)),
  set: (key, value) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  },
  remove: (key) => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  }
};

export class AuthService<TUser = Record<string, unknown>> {
  readonly config: AuthConfig;
  private http: HttpClient | null = null;
  private attached = new WeakSet<HttpClient>();
  private _user: TUser | null = null;
  private authenticated = false;
  private refreshing: Promise<string> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private loading: Promise<boolean> | null = null;
  private loaded = false;
  private listeners: { [K in keyof AuthEvents<TUser>]: Set<AuthEvents<TUser>[K]> } = {
    user: new Set(),
    auth: new Set(),
    refresh: new Set(),
    refreshError: new Set()
  };

  /** Cómo navegar en `login/logout({ redirect })`. El adaptador Vue lo cambia por `router.push`. */
  navigate: (target: RedirectTarget) => void = (target) => {
    if (typeof target === 'string' && target && typeof window !== 'undefined') {
      window.location.href = target;
    }
  };

  constructor(options: AuthOptions & { http?: HttpClient } = {}) {
    const { http, ...config } = options;
    this.config = mergeConfig(config);
    if (http) this.attach(http);

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  // ============ API compatible con 1.x ============

  check(): boolean {
    return !!this._user && !!this.token();
  }

  /**
   * `user()` devuelve el usuario, `user('campo')` un campo y `user(obj)` lo reemplaza
   * (como en 1.x, después de un `login({ fetchUser: false })`).
   */
  user(): TUser | null;
  user<K extends keyof TUser>(key: K): TUser[K] | undefined;
  user(user: TUser | null): TUser | null;
  user(arg?: unknown): unknown {
    if (arg === undefined) return this._user;
    if (typeof arg === 'string') return (this._user as Record<string, unknown> | null)?.[arg];
    this.setUser(arg as TUser | null);
    return this._user;
  }

  setUser(user: TUser | null): void {
    this._user = user;
    this.emit('user', user);
    this.updateAuthState();
  }

  token(): string | null {
    return this.storage.get(this.config.storageKeys.accessToken);
  }

  /** true cuando terminó la restauración inicial de la sesión (`init()`). */
  ready(): boolean {
    return this.loaded;
  }

  /** Promesa de la restauración inicial; la lanza si nadie la lanzó todavía. */
  load(): Promise<boolean> {
    return this.loading ?? this.init();
  }

  fetch(): Promise<TUser> {
    return this.fetchUser();
  }

  async login(options: LoginOptions): Promise<{ data: TokenResponse }> {
    const { data: credentials, url, headers, fetchUser = true, redirect } = options;
    const { oauth } = this.config;
    const body = credentials.grant_type
      ? credentials
      : {
          grant_type: oauth.grantType,
          client_id: oauth.clientId,
          client_secret: oauth.clientSecret,
          username: credentials.username ?? credentials.email,
          password: credentials.password
        };
    const tokenUrl = url ?? this.resolve(this.config.endpoints.login);

    const response = await this.client().post<TokenResponse>(tokenUrl, body, { headers, [SKIP_AUTH]: true });
    this.applyToken(response.data);

    if (url) this.storage.set(this.config.storageKeys.tokenUrl, url);
    else this.storage.remove(this.config.storageKeys.tokenUrl);

    if (fetchUser) await this.fetchUser();
    this.updateAuthState();
    if (redirect) this.navigate(redirect);
    return response;
  }

  async logout(options: LogoutOptions = {}): Promise<void> {
    const { logout } = this.config.endpoints;
    if (logout !== null && options.makeRequest !== false && this.token() && this.http) {
      try {
        await this.http.post(this.resolve(logout));
      } catch {
        // El logout local se hace igual.
      }
    }
    this.clearSession();
    if (options.redirect) this.navigate(options.redirect);
  }

  // ============ Sesión ============

  async register(data: RegisterData): Promise<{ data: Partial<TokenResponse> }> {
    const response = await this.client().post<Partial<TokenResponse>>(
      this.resolve(this.config.endpoints.register),
      data,
      {
        [SKIP_AUTH]: true
      }
    );
    if (response.data.access_token) {
      this.applyToken(response.data as TokenResponse);
      await this.fetchUser();
    }
    return response;
  }

  async fetchUser(): Promise<TUser> {
    const response = await this.client().get<TUser>(this.resolve(this.config.endpoints.me));
    this.setUser(response.data);
    return response.data;
  }

  /** Refresca el token. Las llamadas concurrentes comparten un único request. */
  refresh(): Promise<string> {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  private async doRefresh(): Promise<string> {
    const refreshToken = this.storage.get(this.config.storageKeys.refreshToken);
    if (!refreshToken) throw new Error('[Auth] No hay refresh token');

    const { oauth, endpoints } = this.config;
    const url =
      this.storage.get(this.config.storageKeys.tokenUrl) ?? this.resolve(endpoints.refresh ?? endpoints.login);
    const response = await this.client().post<TokenResponse>(
      url,
      {
        grant_type: 'refresh_token',
        client_id: oauth.clientId,
        client_secret: oauth.clientSecret,
        refresh_token: refreshToken,
        notification_token: null
      },
      { [SKIP_AUTH]: true }
    );
    this.applyToken(response.data);
    this.emit('refresh', response.data.access_token);
    return response.data.access_token;
  }

  /** Restaura la sesión guardada: usa el token vigente o refresca, y pide el usuario. */
  init(): Promise<boolean> {
    this.loading = this.restore().finally(() => {
      this.loaded = true;
    });
    return this.loading;
  }

  private async restore(): Promise<boolean> {
    const hasRefresh = !!this.storage.get(this.config.storageKeys.refreshToken);
    if (!this.token() && !hasRefresh) return false;

    try {
      if (!this.token() || this.isExpired()) await this.refresh();
      else this.scheduleRefresh();
      await this.fetchUser();
      return true;
    } catch (error) {
      // Sólo se cierra la sesión si el servidor la rechazó; un error de red o de config no la pierde.
      if (isUnauthorized(error) || !this.token()) this.clearSession();
      return false;
    }
  }

  setBaseURL(url: string): void {
    this.config.baseURL = url;
  }

  // ============ Interceptores ============

  /** Instala Bearer en cada request y 401 → refresh → reintento. Idempotente por cliente. */
  attach(http: HttpClient): void {
    this.http = http;
    if (this.attached.has(http)) return;
    this.attached.add(http);

    http.interceptors.request.use((config: HttpRequestConfig) => {
      const token = this.token();
      if (token && !config[SKIP_AUTH]) {
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    http.interceptors.response.use(
      (response) => response,
      async (error) => {
        const request: HttpRequestConfig | undefined = error?.config;
        const canRefresh =
          error?.response?.status === 401 &&
          request &&
          !request._retry &&
          !request[SKIP_AUTH] &&
          !!this.storage.get(this.config.storageKeys.refreshToken);
        if (!canRefresh) throw error;

        request._retry = true;
        let token: string;
        try {
          token = await this.refresh();
        } catch (refreshError) {
          this.handleRefreshError(refreshError);
          throw refreshError;
        }
        request.headers = request.headers ?? {};
        request.headers.Authorization = `Bearer ${token}`;
        return http(request);
      }
    );
  }

  /** @deprecated Usar `attach(http)`. */
  setupInterceptors(): void {
    this.attach(this.client());
  }

  // ============ Social login ============

  loginWithProvider(provider: string): void {
    const providerConfig = this.config.socialProviders[provider];
    if (!providerConfig) throw new Error(`[Auth] Provider "${provider}" no configurado`);

    const state = randomState();
    sessionStorage.setItem('oauth_state', state);
    const params = new URLSearchParams({
      client_id: providerConfig.clientId,
      redirect_uri: providerConfig.redirectUri,
      response_type: 'code',
      scope: providerConfig.scope || '',
      state
    });
    window.location.href = `${providerConfig.authUrl}?${params}`;
  }

  async handleSocialCallback(provider: string, { code, state }: { code: string; state: string }): Promise<TUser> {
    const savedState = sessionStorage.getItem('oauth_state');
    sessionStorage.removeItem('oauth_state');
    if (!savedState || state !== savedState) throw new Error('[Auth] OAuth state inválido');

    const providerConfig = this.config.socialProviders[provider];
    if (!providerConfig) throw new Error(`[Auth] Provider "${provider}" no configurado`);
    const endpoint = providerConfig.callbackEndpoint || `/auth/${provider}/callback`;

    const response = await this.client().post<TokenResponse>(
      this.resolve(endpoint),
      { code, redirect_uri: providerConfig.redirectUri },
      { [SKIP_AUTH]: true }
    );
    this.applyToken(response.data);
    return this.fetchUser();
  }

  // ============ Eventos ============

  on<K extends keyof AuthEvents<TUser>>(event: K, listener: AuthEvents<TUser>[K]): () => void {
    this.listeners[event].add(listener);
    return () => this.listeners[event].delete(listener);
  }

  private emit<K extends keyof AuthEvents<TUser>>(event: K, ...args: Parameters<AuthEvents<TUser>[K]>): void {
    for (const listener of this.listeners[event]) (listener as (...a: unknown[]) => void)(...args);
  }

  private updateAuthState(): void {
    const authenticated = this.check();
    if (authenticated === this.authenticated) return;
    this.authenticated = authenticated;
    this.emit('auth', authenticated);
  }

  // ============ Refresh por timer ============

  private scheduleRefresh(): void {
    this.stopRefreshTimer();
    const expiresAt = this.getExpiresAt();
    if (!expiresAt || !this.storage.get(this.config.storageKeys.refreshToken)) return;

    const delay = expiresAt - Date.now() - this.config.refreshBeforeExpiry * 1000;
    if (delay <= 0) {
      this.refresh().catch((error) => this.handleRefreshError(error));
      return;
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.refresh().catch((error) => this.handleRefreshError(error));
    }, delay);
  }

  private stopRefreshTimer(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }

  /** En PWA y pestañas en segundo plano los timers se suspenden: al volver se revalida. */
  private onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible' && this.token()) this.scheduleRefresh();
  };

  private handleRefreshError(error: unknown): void {
    this.emit('refreshError', error);
    this.clearSession();
  }

  // ============ Storage ============

  private get storage(): AuthStorage {
    return this.config.storage;
  }

  private applyToken(data: TokenResponse | undefined): void {
    if (!data?.access_token) {
      throw new Error(`[Auth] Respuesta de token inválida${data?.error ? `: ${data.error}` : ''}`);
    }
    const keys = this.config.storageKeys;
    this.storage.set(keys.accessToken, data.access_token);
    if (data.refresh_token) this.storage.set(keys.refreshToken, data.refresh_token);
    if (data.expires_in) this.storage.set(keys.expiresAt, String(Date.now() + data.expires_in * 1000));
    else this.storage.remove(keys.expiresAt);
    this.scheduleRefresh();
  }

  private clearSession(): void {
    this.stopRefreshTimer();
    for (const key of Object.values(this.config.storageKeys)) this.storage.remove(key);
    this.setUser(null);
  }

  private getExpiresAt(): number {
    return Number(this.storage.get(this.config.storageKeys.expiresAt)) || 0;
  }

  /** Sin fecha de vencimiento guardada se asume vigente: si no lo está, el 401 dispara el refresh. */
  private isExpired(): boolean {
    const expiresAt = this.getExpiresAt();
    return !!expiresAt && Date.now() >= expiresAt;
  }

  // ============ Helpers ============

  private client(): HttpClient {
    if (!this.http) throw new Error('[Auth] Falta el cliente http: pasarlo en las opciones o llamar a attach(http)');
    return this.http;
  }

  private resolve(endpoint: Endpoint): string {
    const { baseURL } = this.config;
    if (typeof endpoint === 'function') return endpoint({ baseURL });
    if (!baseURL || /^([a-z][a-z\d+.-]*:)?\/\//i.test(endpoint)) return endpoint;
    return `${baseURL.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;
  }

  destroy(): void {
    this.stopRefreshTimer();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
  }
}

function mergeConfig(config: AuthOptions): AuthConfig {
  return {
    baseURL: config.baseURL ?? '',
    endpoints: {
      login: '/oauth/token',
      register: '/register',
      me: '/me',
      logout: '/logout',
      ...config.endpoints
    },
    oauth: {
      clientId: '',
      clientSecret: '',
      grantType: 'password',
      ...config.oauth
    },
    storage: config.storage ?? localStorageAdapter,
    storageKeys: {
      accessToken: 'accessToken',
      refreshToken: 'refreshToken',
      expiresAt: 'tokenExpireDate',
      tokenUrl: 'authTokenUrl',
      ...config.storageKeys
    },
    socialProviders: config.socialProviders ?? {},
    refreshBeforeExpiry: config.refreshBeforeExpiry ?? 60
  };
}

function isUnauthorized(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 400 || status === 401;
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

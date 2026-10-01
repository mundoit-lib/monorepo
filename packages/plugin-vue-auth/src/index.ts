import type { AuthConfig, AuthResponse, HttpClient, LoginCredentials, RegisterData, TokenResponse } from './types.ts';

export class AuthService<TUser = Record<string, unknown>> {
  private http: HttpClient;
  private config: AuthConfig;
  private _user: TUser | null = null;
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (token: string) => void;
    reject: (error: unknown) => void;
  }> = [];

  // Timer para refresh automático
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private refreshBeforeExpiry = 60; // segundos antes de expirar

  // Callbacks para frameworks reactivos
  public onUserChange: ((user: TUser | null) => void) | null = null;
  public onAuthStateChange: ((isAuthenticated: boolean) => void) | null = null;
  public onTokenRefresh: ((token: string) => void) | null = null;
  public onRefreshError: ((error: unknown) => void) | null = null;

  constructor(httpClient: HttpClient, config: Partial<AuthConfig> = {}) {
    this.http = httpClient;
    this.config = this.mergeConfig(config);

    if (config.refreshBeforeExpiry) {
      this.refreshBeforeExpiry = config.refreshBeforeExpiry;
    }
  }

  private mergeConfig(config: Partial<AuthConfig>): AuthConfig {
    return {
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
      storage: {
        accessTokenKey: 'accessToken',
        refreshTokenKey: 'refreshToken',
        expiresAtKey: 'tokenExpiresAt',
        expiresInKey: 'tokenExpiresIn',
        ...config.storage
      },
      socialProviders: config.socialProviders || {},
      refreshBeforeExpiry: config.refreshBeforeExpiry || 60
    };
  }

  // ============ API Compatible con vue-auth ============

  check(): boolean {
    return !!this._user && !!this.getAccessToken() && !this.isExpired();
  }

  user(): TUser | null;
  user<K extends keyof TUser>(key: K): TUser[K] | undefined;
  user<K extends keyof TUser>(key?: K): TUser | TUser[K] | null | undefined {
    if (key) {
      return this._user?.[key];
    }
    return this._user;
  }

  async login(options: { data: LoginCredentials; redirect?: string }): Promise<AuthResponse<TUser>> {
    const { data: credentials } = options;

    try {
      const response = await this.http.post<TokenResponse>(this.config.endpoints.login, {
        grant_type: this.config.oauth.grantType,
        client_id: this.config.oauth.clientId,
        client_secret: this.config.oauth.clientSecret,
        username: credentials.username || credentials.email,
        password: credentials.password
      });

      const { access_token, refresh_token, expires_in } = response.data;
      this.setTokens(access_token, refresh_token, expires_in);

      // Iniciar el timer de refresh
      this.startRefreshTimer(expires_in);

      await this.fetchUser();
      this.notifyAuthStateChange(true);

      if (options.redirect && typeof window !== 'undefined') {
        window.location.href = options.redirect;
      }

      return { success: true, data: this._user! };
    } catch (error) {
      return { success: false, error };
    }
  }

  logout(options: { redirect?: string } = {}): void {
    // Detener el timer
    this.stopRefreshTimer();

    this.clearTokens();
    this._user = null;
    this.notifyUserChange(null);
    this.notifyAuthStateChange(false);

    if (options.redirect && typeof window !== 'undefined') {
      window.location.href = options.redirect;
    }
  }

  token(): string | null {
    return this.getAccessToken();
  }

  // ============ Refresh Timer ============

  private startRefreshTimer(expiresIn: number): void {
    // Limpiar timer anterior si existe
    this.stopRefreshTimer();

    // Calcular cuando hacer refresh (X segundos antes de que expire)
    const refreshIn = (expiresIn - this.refreshBeforeExpiry) * 1000;

    if (refreshIn <= 0) {
      // Token ya está por expirar, refrescar inmediatamente
      console.warn('[Auth] Token expires too soon, refreshing immediately');
      this.refresh().catch(this.handleRefreshError.bind(this));
      return;
    }

    console.log(`[Auth] Token refresh scheduled in ${Math.round(refreshIn / 1000 / 60)} minutes`);

    this.refreshTimer = setInterval(async () => {
      console.log('[Auth] Auto-refreshing token...');
      try {
        await this.refresh();
        console.log('[Auth] Token refreshed successfully');
      } catch (error) {
        this.handleRefreshError(error);
      }
    }, refreshIn);
  }

  private stopRefreshTimer(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
      console.log('[Auth] Refresh timer stopped');
    }
  }

  private handleRefreshError(error: unknown): void {
    console.error('[Auth] Token refresh failed:', error);
    this.onRefreshError?.(error);
    this.logout();
  }

  /**
   * Calcular el próximo refresh basado en lo guardado en storage
   * Útil para restaurar el timer después de recargar la página
   */
  private restoreRefreshTimer(): void {
    const expiresAt = this.getExpiresAt();
    const expiresIn = this.getExpiresIn();

    if (!expiresAt || !expiresIn) return;

    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;

    if (timeUntilExpiry <= 0) {
      // Token expirado, intentar refresh inmediato
      this.refresh().catch(this.handleRefreshError.bind(this));
      return;
    }

    // Calcular tiempo hasta el próximo refresh
    const refreshIn = timeUntilExpiry - this.refreshBeforeExpiry * 1000;

    if (refreshIn <= 0) {
      // Ya pasó el momento de refresh, hacerlo ahora
      this.refresh().catch(this.handleRefreshError.bind(this));
      return;
    }

    console.log(`[Auth] Restoring refresh timer, next refresh in ${Math.round(refreshIn / 1000 / 60)} minutes`);

    this.refreshTimer = setInterval(async () => {
      console.log('[Auth] Auto-refreshing token...');
      try {
        await this.refresh();
      } catch (error) {
        this.handleRefreshError(error);
      }
    }, refreshIn);
  }

  // ============ Core Methods ============

  async register(data: RegisterData): Promise<AuthResponse<TUser>> {
    try {
      const response = await this.http.post<TokenResponse & Partial<TUser>>(this.config.endpoints.register, data);

      if (response.data.access_token) {
        const { access_token, refresh_token, expires_in } = response.data;
        this.setTokens(access_token, refresh_token, expires_in);
        this.startRefreshTimer(expires_in);
        await this.fetchUser();
        this.notifyAuthStateChange(true);
      }

      return { success: true, data: this._user ?? undefined };
    } catch (error) {
      return { success: false, error };
    }
  }

  async fetchUser(): Promise<TUser> {
    const response = await this.http.get<TUser>(this.config.endpoints.me);
    this._user = response.data;
    this.notifyUserChange(this._user);
    return this._user;
  }

  async refresh(): Promise<string> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    // Evitar múltiples refresh simultáneos
    if (this.isRefreshing) {
      return new Promise((resolve, reject) => {
        this.failedQueue.push({ resolve, reject });
      });
    }

    this.isRefreshing = true;

    try {
      const response = await this.http.post<TokenResponse>(this.config.endpoints.login, {
        grant_type: 'refresh_token',
        client_id: this.config.oauth.clientId,
        client_secret: this.config.oauth.clientSecret,
        refresh_token: refreshToken,
        notification_token: null
      });

      const { access_token, refresh_token, expires_in } = response.data;
      this.setTokens(access_token, refresh_token, expires_in);

      // Reiniciar el timer con el nuevo expires_in
      this.startRefreshTimer(expires_in);

      this.onTokenRefresh?.(access_token);
      this.processQueue(null, access_token);

      return access_token;
    } catch (error) {
      this.processQueue(error, '');
      throw error;
    } finally {
      this.isRefreshing = false;
    }
  }

  // ============ Social Login ============

  loginWithProvider(provider: string): void {
    const providerConfig = this.config.socialProviders[provider];
    if (!providerConfig) {
      throw new Error(`Provider "${provider}" not configured`);
    }

    const state = this.generateState();
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

  async handleSocialCallback(
    provider: string,
    { code, state }: { code: string; state: string }
  ): Promise<AuthResponse<TUser>> {
    const savedState = sessionStorage.getItem('oauth_state');
    if (state !== savedState) {
      throw new Error('Invalid OAuth state');
    }
    sessionStorage.removeItem('oauth_state');

    const providerConfig = this.config.socialProviders[provider];
    const endpoint = providerConfig.callbackEndpoint || `/auth/${provider}/callback`;

    try {
      const response = await this.http.post<TokenResponse>(endpoint, {
        code,
        redirect_uri: providerConfig.redirectUri
      });

      const { access_token, refresh_token, expires_in } = response.data;
      this.setTokens(access_token, refresh_token, expires_in);
      this.startRefreshTimer(expires_in);

      await this.fetchUser();
      this.notifyAuthStateChange(true);

      return { success: true, data: this._user! };
    } catch (error) {
      return { success: false, error };
    }
  }

  // ============ Interceptors ============

  setupInterceptors(): void {
    // Request interceptor - solo agrega el token
    this.http.interceptors.request.use((config: any) => {
      const token = this.getAccessToken();
      if (token) {
        config.headers = config.headers || {};
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      return config;
    });

    // Response interceptor - maneja 401 como fallback
    this.http.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // Solo si es 401 y no es retry (fallback por si el timer falló)
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const newToken = await this.refresh();
            originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
            return this.http(originalRequest);
          } catch (refreshError) {
            this.logout();
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // ============ Init ============

  async init(): Promise<boolean> {
    const token = this.getAccessToken();

    if (token && !this.isExpired()) {
      try {
        await this.fetchUser();
        // Restaurar el timer basado en lo guardado
        this.restoreRefreshTimer();
        return true;
      } catch {
        this.logout();
        return false;
      }
    } else if (this.getRefreshToken()) {
      try {
        await this.refresh();
        await this.fetchUser();
        return true;
      } catch {
        this.logout();
        return false;
      }
    }

    return false;
  }

  // ============ Storage helpers ============

  private setTokens(accessToken: string, refreshToken: string, expiresIn: number): void {
    const expiresAt = Date.now() + expiresIn * 1000;
    localStorage.setItem(this.config.storage.accessTokenKey, accessToken);
    localStorage.setItem(this.config.storage.refreshTokenKey, refreshToken);
    localStorage.setItem(this.config.storage.expiresAtKey, expiresAt.toString());
    localStorage.setItem(this.config.storage.expiresInKey, expiresIn.toString());
  }

  private getAccessToken(): string | null {
    return localStorage.getItem(this.config.storage.accessTokenKey);
  }

  private getRefreshToken(): string | null {
    return localStorage.getItem(this.config.storage.refreshTokenKey);
  }

  private getExpiresAt(): number {
    return Number.parseInt(localStorage.getItem(this.config.storage.expiresAtKey) || '0');
  }

  private getExpiresIn(): number {
    return Number.parseInt(localStorage.getItem(this.config.storage.expiresInKey) || '0');
  }

  private clearTokens(): void {
    localStorage.removeItem(this.config.storage.accessTokenKey);
    localStorage.removeItem(this.config.storage.refreshTokenKey);
    localStorage.removeItem(this.config.storage.expiresAtKey);
    localStorage.removeItem(this.config.storage.expiresInKey);
  }

  private isExpired(): boolean {
    return Date.now() > this.getExpiresAt();
  }

  // ============ Private helpers ============

  private processQueue(error: unknown, token: string): void {
    this.failedQueue.forEach((prom) => {
      if (error) prom.reject(error);
      else prom.resolve(token);
    });
    this.failedQueue = [];
  }

  private notifyUserChange(user: TUser | null): void {
    this.onUserChange?.(user);
  }

  private notifyAuthStateChange(isAuthenticated: boolean): void {
    this.onAuthStateChange?.(isAuthenticated);
  }

  private generateState(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  // ============ Cleanup ============

  destroy(): void {
    this.stopRefreshTimer();
  }
}

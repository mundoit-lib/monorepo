export interface AuthConfig {
  endpoints: {
    login: string;
    register: string;
    me: string;
    logout: string;
  };
  oauth: {
    clientId: string;
    clientSecret: string;
    grantType: string;
  };
  storage: {
    accessTokenKey: string;
    refreshTokenKey: string;
    expiresAtKey: string;
    expiresInKey: string;
  };
  socialProviders: Record<string, SocialProviderConfig>;
  refreshBeforeExpiry: number; // segundos antes de expirar para hacer refresh
}

export interface SocialProviderConfig {
  clientId: string;
  authUrl: string;
  redirectUri: string;
  scope?: string;
  callbackEndpoint?: string;
}

export interface LoginCredentials {
  email?: string;
  username?: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name?: string;
  [key: string]: unknown;
}

export interface AuthResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: unknown;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface HttpClient {
  get<T = unknown>(url: string, config?: unknown): Promise<{ data: T }>;
  post<T = unknown>(url: string, data?: unknown, config?: unknown): Promise<{ data: T }>;
  interceptors: {
    request: {
      use: (onFulfilled: (config: any) => any, onRejected?: (error: any) => any) => void;
    };
    response: {
      use: (onFulfilled: (response: any) => any, onRejected?: (error: any) => any) => void;
    };
  };
  (config: any): Promise<any>;
}

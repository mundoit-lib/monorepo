import { vi } from 'vitest';

/**
 * Issuer OIDC falso para los tests de protocolo: reemplaza `fetch` y contesta lo que `oidc-client-ts` pide de
 * verdad (discovery, token endpoint y userinfo), así los tests ejercitan la librería real (PKCE, canje del code,
 * refresh con rotación, validación del id_token) sin servidor ni browser.
 *
 * Imita a Histrix: cliente público (`token_endpoint_auth_methods_supported: ['none']`), sin `end_session_endpoint`,
 * `always_issue_new_refresh_token` (cada refresh entrega uno nuevo y el anterior deja de servir) y errores OAuth
 * como `{ error, error_description }` con 400.
 */

interface TokenRequest {
  /** URL del token endpoint que recibió el pedido. */
  url: string;
  grant_type: string | null;
  code: string | null;
  code_verifier: string | null;
  redirect_uri: string | null;
  refresh_token: string | null;
  client_id: string | null;
  client_secret: string | null;
}

export interface FakeIssuerOptions {
  /** URL del issuer, p. ej. `https://h/api/db/demo`. */
  issuer: string;
  /** Cliente registrado. Por defecto `histrix-app`. */
  clientId?: string;
  /** `redirect_uri` registrada para el cliente. Si falta, acepta cualquiera. */
  redirectUri?: string;
  /** Vida del access token en segundos. Por defecto 3600. */
  accessLifetime?: number;
  /** Claims del usuario que se loguea (van al id_token y a `/userinfo`). */
  claims?: Record<string, unknown>;
  /** Claims que sólo devuelve `/userinfo` (para ver el merge con `loadUserInfo`). */
  userInfoClaims?: Record<string, unknown>;
  /** Devolver un id_token nuevo también en el refresh (Histrix no lo hace hoy). Por defecto `false`. */
  idTokenOnRefresh?: boolean;
}

type Failure = 'invalid_grant' | 'server_error' | 'network';

interface PendingCode {
  challenge: string | null;
  method: string | null;
  redirectUri: string;
  nonce: string | null;
  scope: string;
  clientId: string;
}

export interface FakeIssuer {
  readonly issuer: string;
  readonly clientId: string;
  /** Todas las requests recibidas (discovery, token, userinfo), en orden. */
  readonly requests: Array<{ method: string; url: string; authorization: string | null }>;
  /** Los pedidos al token endpoint, parseados. */
  readonly tokenRequests: TokenRequest[];
  /** Access tokens vigentes (los conoce `/userinfo`). */
  readonly accessTokens: Set<string>;
  /** Refresh tokens que todavía sirven. Con rotación, acá hay a lo sumo uno por sesión. */
  readonly refreshTokens: Set<string>;
  /**
   * "La persona se logueó y dio el consent": a partir de la URL del authorize que armó el cliente, valida el pedido
   * (client_id, response_type=code, PKCE S256) y devuelve la URL de callback con el `code` y el `state`.
   */
  authorize(authorizeUrl: string): string;
  /** El próximo pedido al token endpoint falla así; después vuelve a andar. */
  failNext(failure: Failure): void;
  /** Revoca todos los refresh tokens: el próximo refresh es `invalid_grant` (sesión cerrada en el servidor). */
  revokeRefreshTokens(): void;
  /** Vence todos los access tokens: `/userinfo` (y una API que los consulte) responde 401. */
  revokeAccessTokens(): void;
  /** Cuántas veces se pidió el discovery. */
  discoveryCount(): number;
}

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const encodeJson = (value: unknown): string => base64url(new TextEncoder().encode(JSON.stringify(value)));

/** JWT sin firma válida: oidc-client-ts no verifica la firma en el cliente, sólo decodifica los claims. */
const unsignedJwt = (payload: Record<string, unknown>): string =>
  `${encodeJson({ alg: 'RS256', typ: 'JWT', kid: 'test' })}.${encodeJson(payload)}.firma`;

const s256 = async (verifier: string): Promise<string> =>
  base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const oauthError = (error: string, description: string, status = 400): Response =>
  json(status, { error, error_description: description });

const now = (): number => Math.floor(Date.now() / 1000);

let counter = 0;

export function createFakeIssuer(options: FakeIssuerOptions): FakeIssuer {
  const issuer = options.issuer.replace(/\/+$/, '');
  const clientId = options.clientId ?? 'histrix-app';
  const accessLifetime = options.accessLifetime ?? 3600;
  const claims = { sub: '42', name: 'Ana Prueba', preferred_username: 'ana', ...options.claims };

  const requests: FakeIssuer['requests'] = [];
  const tokenRequests: TokenRequest[] = [];
  const accessTokens = new Set<string>();
  const refreshTokens = new Set<string>();
  const codes = new Map<string, PendingCode>();
  /** Qué sesión (nonce/scope) respalda cada refresh token, para el id_token del refresh. */
  const sessions = new Map<string, PendingCode>();
  let nextFailure: Failure | null = null;

  const metadata = {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    userinfo_endpoint: `${issuer}/userinfo`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    revocation_endpoint: `${issuer}/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256', 'plain']
  };

  const idToken = (session: PendingCode, extra: Record<string, unknown> = {}): string =>
    unsignedJwt({
      iss: issuer,
      aud: session.clientId,
      iat: now(),
      exp: now() + accessLifetime,
      ...(session.nonce ? { nonce: session.nonce } : {}),
      ...claims,
      ...extra
    });

  const issueTokens = (session: PendingCode, withIdToken: boolean) => {
    counter += 1;
    const access = `at-${counter}`;
    const refresh = `rt-${counter}`;
    accessTokens.add(access);
    refreshTokens.add(refresh);
    sessions.set(refresh, session);
    return {
      access_token: access,
      token_type: 'Bearer',
      expires_in: accessLifetime,
      refresh_token: refresh,
      scope: session.scope,
      ...(withIdToken ? { id_token: idToken(session) } : {})
    };
  };

  const handleToken = async (url: string, body: URLSearchParams): Promise<Response> => {
    const request: TokenRequest = {
      url,
      grant_type: body.get('grant_type'),
      code: body.get('code'),
      code_verifier: body.get('code_verifier'),
      redirect_uri: body.get('redirect_uri'),
      refresh_token: body.get('refresh_token'),
      client_id: body.get('client_id'),
      client_secret: body.get('client_secret')
    };
    tokenRequests.push(request);

    if (nextFailure) {
      const failure = nextFailure;
      nextFailure = null;
      if (failure === 'network') throw new TypeError('fetch failed');
      if (failure === 'server_error')
        return new Response('<html>502</html>', { status: 502, headers: { 'Content-Type': 'text/html' } });
      return oauthError('invalid_grant', 'forzado por el test');
    }
    if (request.client_id !== clientId) return oauthError('invalid_client', 'cliente desconocido', 401);
    if (request.client_secret) return oauthError('invalid_client', 'un cliente público no manda secret', 401);

    if (request.grant_type === 'authorization_code') {
      const pending = request.code ? codes.get(request.code) : undefined;
      if (!pending) return oauthError('invalid_grant', 'code inválido, vencido o ya usado');
      codes.delete(request.code!);
      if (request.redirect_uri !== pending.redirectUri) return oauthError('invalid_grant', 'redirect_uri no coincide');
      if (pending.challenge) {
        if (!request.code_verifier) return oauthError('invalid_grant', 'falta code_verifier');
        const expected = pending.method === 'plain' ? request.code_verifier : await s256(request.code_verifier);
        if (expected !== pending.challenge) return oauthError('invalid_grant', 'code_verifier no coincide');
      }
      return json(200, issueTokens(pending, pending.scope.split(' ').includes('openid')));
    }

    if (request.grant_type === 'refresh_token') {
      const refresh = request.refresh_token;
      if (!refresh || !refreshTokens.has(refresh))
        return oauthError('invalid_grant', 'refresh token inválido, revocado o ya rotado');
      // Rotación: el refresh usado deja de servir y la respuesta trae uno nuevo.
      refreshTokens.delete(refresh);
      const session = sessions.get(refresh)!;
      sessions.delete(refresh);
      return json(200, issueTokens(session, options.idTokenOnRefresh === true));
    }

    return oauthError('unsupported_grant_type', `grant_type ${request.grant_type ?? '(vacío)'}`);
  };

  const handle = async (
    method: string,
    url: string,
    headers: Headers,
    body: BodyInit | null | undefined
  ): Promise<Response> => {
    const authorization = headers.get('authorization');
    requests.push({ method, url, authorization });
    const path = url.slice(issuer.length).split('?')[0];

    if (method === 'GET' && path === '/.well-known/openid-configuration') return json(200, metadata);
    if (method === 'POST' && path === '/token')
      return handleToken(url, new URLSearchParams(body as string | URLSearchParams));
    if (method === 'GET' && path === '/userinfo') {
      const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null;
      if (!token || !accessTokens.has(token))
        return oauthError('invalid_token', 'access token inválido o vencido', 401);
      return json(200, { ...claims, ...options.userInfoClaims });
    }
    return json(404, { error: 'not_found', error_description: `${method} ${path}` });
  };

  const fake: FakeIssuer & { handle: typeof handle } = {
    issuer,
    clientId,
    requests,
    tokenRequests,
    accessTokens,
    refreshTokens,
    handle,

    authorize(authorizeUrl) {
      const url = new URL(authorizeUrl);
      if (!authorizeUrl.startsWith(metadata.authorization_endpoint))
        throw new Error(`authorize contra otro issuer: ${authorizeUrl}`);
      const params = url.searchParams;
      if (params.get('client_id') !== clientId) throw new Error(`client_id desconocido: ${params.get('client_id')}`);
      if (params.get('response_type') !== 'code')
        throw new Error(`response_type no soportado: ${params.get('response_type')}`);
      const redirectUri = params.get('redirect_uri');
      if (!redirectUri) throw new Error('authorize sin redirect_uri');
      if (options.redirectUri && redirectUri !== options.redirectUri)
        throw new Error(`redirect_uri no registrada: ${redirectUri}`);
      const state = params.get('state');
      if (!state) throw new Error('authorize sin state');
      counter += 1;
      const code = `code-${counter}`;
      codes.set(code, {
        challenge: params.get('code_challenge'),
        method: params.get('code_challenge_method'),
        redirectUri,
        nonce: params.get('nonce'),
        scope: params.get('scope') ?? '',
        clientId
      });
      const callback = new URL(redirectUri);
      callback.searchParams.set('code', code);
      callback.searchParams.set('state', state);
      return callback.toString();
    },

    failNext(failure) {
      nextFailure = failure;
    },
    revokeRefreshTokens() {
      refreshTokens.clear();
    },
    revokeAccessTokens() {
      accessTokens.clear();
    },
    discoveryCount: () => requests.filter((r) => r.url.endsWith('/.well-known/openid-configuration')).length
  };
  return fake;
}

/**
 * Instala un `fetch` que enruta por prefijo de URL a cada issuer falso (multi-tenant: cada tenant es un issuer).
 * Lo que no matchea ningún issuer rechaza como un error de red. Devuelve el restore (`vi.unstubAllGlobals`).
 */
export function stubFetch(...issuers: FakeIssuer[]): () => void {
  const handlers = issuers as Array<
    FakeIssuer & {
      handle(method: string, url: string, headers: Headers, body: BodyInit | null | undefined): Promise<Response>;
    }
  >;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const target = handlers.find((issuer) => url === issuer.issuer || url.startsWith(`${issuer.issuer}/`));
    if (!target) throw new TypeError(`fetch failed: ${url} no es de ningún issuer falso`);
    return target.handle(init?.method ?? 'GET', url, new Headers(init?.headers), init?.body);
  });
  vi.stubGlobal('fetch', fetchMock);
  return () => vi.unstubAllGlobals();
}

#!/usr/bin/env node
/**
 * Smoke E2E de plugin-vue-oidc contra un Histrix real (por defecto el container local), fuera de CI.
 *
 * Sirve scripts/smoke/ (una "app" mínima sobre el `dist/` del paquete, sin Vue) en http://localhost:5190, el
 * `redirect_uri` registrado para el client `histrix-app`, y la maneja con playwright-core + el Chrome del sistema:
 *
 *   1. /connect → login(): discovery y redirección al authorize con code + PKCE S256.
 *   2. Login de Histrix (usuario y contraseña) y consent, si lo pide.
 *   3. /callback: canje del code (token endpoint con code_verifier, sin secret) y vuelta al redirect del state.
 *   4. Con la sesión: GET /me y GET /menu/phpmen con Bearer.
 *   5. 401 de verdad: se pisa el access token guardado por uno inválido y se recarga. La API da 401, el plugin
 *      renueva con el refresh token (un solo POST /token) y reintenta; el refresh token rota.
 *   6. logout(): borra la sesión guardada.
 *
 * El servidor escucha en un puerto libre cualquiera y el browser enruta `http://localhost:5190/**` hacia él
 * (`page.route`): el origen que ve Histrix es el registrado aunque el :5190 lo tenga la app genérica.
 *
 * Uso (con `pnpm build` hecho y el container arriba):
 *   HTX_PASS=… pnpm --filter @mundoit-lib/plugin-vue-oidc smoke
 * Variables: HTX_HOST (http://localhost), HTX_DB (htx_test), HTX_USER (histrix), HTX_PASS (obligatoria),
 * SMOKE_ORIGIN (http://localhost:5190, el origen del redirect_uri registrado), CHROME (/usr/bin/google-chrome),
 * SHOT (captura final; vacío = no guarda), HEADED=1 para verlo.
 */
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HOST = (process.env.HTX_HOST || 'http://localhost').replace(/\/+$/, '');
const DB = process.env.HTX_DB || 'htx_test';
const USER = process.env.HTX_USER || 'histrix';
const PASS = process.env.HTX_PASS || '';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const APP = (process.env.SMOKE_ORIGIN || 'http://localhost:5190').replace(/\/+$/, '');
const ISSUER = `${HOST}/api/db/${DB}`;

if (!PASS) {
  console.error('Falta HTX_PASS (contraseña del usuario de prueba de la base).');
  process.exit(2);
}

// ---------- servidor estático ----------
const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, '..');
const resolvePkg = (name) => dirname(fileURLToPath(import.meta.resolve(`${name}/package.json`)));
const files = {
  '/smoke.js': [join(here, 'smoke/page.js'), 'text/javascript'],
  '/vendor/oidc-client-ts.global.js': [
    join(resolvePkg('oidc-client-ts'), 'dist/browser/oidc-client-ts.js'),
    'text/javascript'
  ],
  '/vendor/axios.js': [join(resolvePkg('axios'), 'dist/esm/axios.js'), 'text/javascript'],
  '/vendor/vue.js': [join(resolvePkg('vue'), 'dist/vue.esm-browser.js'), 'text/javascript']
};
// El build browser de oidc-client-ts es IIFE (window.oidc): este shim lo re-exporta para el import del dist.
const oidcShim =
  'const o = globalThis.oidc; export const { UserManager, WebStorageStateStore, OidcClient, Log } = o; export default o;';

try {
  await readFile(join(pkg, 'dist/index.js'));
} catch {
  console.error(
    'No está dist/index.js: corré `pnpm build` (o `pnpm turbo run build --filter @mundoit-lib/plugin-vue-oidc`).'
  );
  process.exit(2);
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url, APP).pathname;
  try {
    if (path === '/vendor/oidc-client-ts.js') return send(res, 200, 'text/javascript', oidcShim);
    if (path.startsWith('/dist/')) return send(res, 200, 'text/javascript', await readFile(join(pkg, path)));
    if (files[path]) return send(res, 200, files[path][1], await readFile(files[path][0]));
    return send(res, 200, 'text/html', await readFile(join(here, 'smoke/index.html')));
  } catch (error) {
    return send(res, 404, 'text/plain', String(error));
  }
});
const send = (res, status, type, body) => {
  res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
  res.end(body);
};
await new Promise((resolve, reject) => server.listen(0, '127.0.0.1').once('listening', resolve).once('error', reject));
const INTERNAL_PORT = server.address().port;
if (process.env.SMOKE_DEBUG)
  server.on('request', (req, res) =>
    res.once('finish', () => console.log(`   [app] ${res.statusCode} ${req.method} ${req.url}`))
  );

// ---------- browser ----------
const appUrl = new URL(APP);
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: !process.env.HEADED,
  // El origen de la app (host:puerto del redirect_uri registrado) resuelve al servidor de este proceso, esté o no
  // ocupado el puerto real: para Chrome la página vive en APP y los tokens quedan bajo ese origen.
  args: ['--no-sandbox', `--host-resolver-rules=MAP ${appUrl.hostname}:${appUrl.port || 80} 127.0.0.1:${INTERNAL_PORT}`]
});
const page = await browser.newPage();
const consola = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') consola.push(`[${m.type()}] ${m.text().slice(0, 200)}`);
});
page.on('pageerror', (e) => consola.push(`[pageerror] ${e.message}`));
/** Requests a la API del tenant: `status METHOD /path` y, para el token endpoint, el body. */
let api = [];
page.on('response', async (r) => {
  const url = r.url();
  if (!url.startsWith(ISSUER)) return;
  const path = url.slice(ISSUER.length).replace(/\?.*/, '');
  api.push({ status: r.status(), method: r.request().method(), path, url, body: r.request().postData() || '' });
});
const apiLine = () => api.map((e) => `${e.status} ${e.method} ${e.path}`).join(', ');

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const smokeState = () => page.evaluate(() => window.__smoke?.state ?? null);
const waitReady = () => page.waitForFunction(() => window.__smoke?.state?.ready === true, null, { timeout: 30_000 });
const storedSession = () =>
  page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('oidc.user:'));
    return key ? { key, ...JSON.parse(localStorage.getItem(key)) } : null;
  });

const watchdog = setTimeout(() => {
  console.error('✘ timeout general (120 s)');
  process.exit(1);
}, 120_000);

try {
  // 1. /connect → login() → authorize
  await page.goto(`${APP}/connect?host=${encodeURIComponent(HOST)}&db=${encodeURIComponent(DB)}`);
  await page.waitForURL((u) => !u.href.startsWith(APP), { timeout: 20_000 });
  // Histrix redirige el authorize a su pantalla de login: el pedido original queda en el registro de la API.
  const authorize = new URL(api.find((e) => e.method === 'GET' && e.path === '/authorize')?.url ?? page.url());
  const q = authorize.searchParams;
  check(
    'discovery',
    api.some((e) => e.path === '/.well-known/openid-configuration' && e.status === 200),
    apiLine()
  );
  check(
    'authorize con code + PKCE S256',
    authorize.href.startsWith(`${ISSUER}/authorize`) &&
      q.get('client_id') === 'histrix-app' &&
      q.get('response_type') === 'code' &&
      q.get('code_challenge_method') === 'S256' &&
      q.get('redirect_uri') === `${APP}/callback` &&
      (q.get('scope') || '').includes('offline_access'),
    `${authorize.origin}${authorize.pathname} client_id=${q.get('client_id')} scope="${q.get('scope')}"`
  );

  // 2. login de Histrix (puede haber redirigido a la pantalla de login) y consent
  await page.waitForLoadState('networkidle').catch(() => {});
  const password = page.locator('input[type="password"]').first();
  await password.waitFor({ timeout: 20_000 });
  await page.locator('input[type="text"], input[name*="user" i], input[name*="login" i]').first().fill(USER);
  await password.fill(PASS);
  await Promise.all([page.waitForNavigation({ timeout: 20_000 }).catch(() => {}), password.press('Enter')]);
  await page.waitForLoadState('networkidle').catch(() => {});
  const permitir = page.getByRole('button', { name: /permitir|autorizar|allow|aceptar/i }).first();
  const conConsent = (await permitir.count()) > 0;
  if (conConsent) await permitir.click();
  check('login de Histrix', true, conConsent ? 'con pantalla de consent' : 'sin consent (recordado o first_party)');

  // 3. callback → redirect → home con /me y menú
  await page.waitForURL((u) => u.href.startsWith(APP), { timeout: 20_000 });
  await waitReady();
  let state = await smokeState();
  const tokenCode = api.find((e) => e.path === '/token' && e.body.includes('grant_type=authorization_code'));
  check(
    'callback: canje del code con code_verifier y sin secret',
    tokenCode?.status === 200 &&
      tokenCode.body.includes('code_verifier=') &&
      !tokenCode.body.includes('client_secret='),
    tokenCode ? `${tokenCode.status} POST /token (${tokenCode.body.replace(/=[^&]*/g, '=…')})` : apiLine()
  );
  check(
    'vuelta al redirect del state',
    state?.callback?.redirect === '/' && page.url() === `${APP}/`,
    `${page.url()} sub=${state?.callback?.sub}`
  );
  let session = await storedSession();
  check(
    'sesión guardada en localStorage (access + refresh + id_token)',
    session?.access_token && session?.refresh_token && session?.id_token,
    session
      ? `${session.key} scope="${session.scope}" vence en ${session.expires_at - Math.floor(Date.now() / 1000)} s`
      : 'sin oidc.user:*'
  );
  check(
    'GET /me con Bearer',
    state?.logged && state?.me && !state?.error,
    state?.me ? Object.keys(state.me).slice(0, 6).join(', ') : state?.error
  );
  check('GET /menu/phpmen', state?.menu !== undefined && !state?.error, `menu=${JSON.stringify(state?.menu)}`);

  // 4. 401 de verdad: access token inválido en storage → la API rechaza → refresh → reintento
  const before = session;
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('oidc.user:'));
    const user = JSON.parse(localStorage.getItem(key));
    user.access_token = 'smoke-token-invalido';
    localStorage.setItem(key, JSON.stringify(user));
  });
  api = [];
  await page.reload();
  await waitReady();
  state = await smokeState();
  session = await storedSession();
  const secuencia = api
    .filter((e) => e.path === '/me' || e.path === '/token')
    .map((e) => `${e.status} ${e.method} ${e.path}`);
  const tokenRefresh = api.filter((e) => e.path === '/token');
  check(
    '401 → refresh → reintento',
    state?.me &&
      !state?.error &&
      secuencia[0] === '401 GET /me' &&
      secuencia.includes('200 POST /token') &&
      secuencia.at(-1) === '200 GET /me',
    secuencia.join(' → ') || apiLine()
  );
  check(
    'un solo POST /token con grant_type=refresh_token',
    tokenRefresh.length === 1 &&
      tokenRefresh[0].body.includes('grant_type=refresh_token') &&
      !tokenRefresh[0].body.includes('client_secret='),
    `${tokenRefresh.length} pedidos`
  );
  check(
    'rotación: access y refresh nuevos en storage',
    session?.access_token &&
      session.access_token !== 'smoke-token-invalido' &&
      session.refresh_token &&
      session.refresh_token !== before?.refresh_token,
    session ? `refresh ${before?.refresh_token === session.refresh_token ? 'igual' : 'rotó'}` : 'sin sesión'
  );
  check('getToken() es el access token nuevo', state?.token && state.token === session?.access_token);

  // 5. logout local (Histrix no anuncia end_session)
  await page.evaluate(() => window.__smoke.auth.logout({ redirect: '/' }));
  await page.waitForLoadState('networkidle').catch(() => {});
  await waitReady();
  state = await smokeState();
  session = await storedSession();
  check('logout borra la sesión', session === null && state?.logged === false, `logged=${state?.logged}`);
} catch (error) {
  check('sin excepciones', false, `${error?.message || error} | url=${page.url()} | api: ${apiLine()}`);
} finally {
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true }).catch(() => {});
  await browser.close();
  server.close();
  clearTimeout(watchdog);
}

const fallidos = checks.filter((c) => !c.ok);
if (consola.length) console.log(`consola del browser:\n   ${consola.slice(0, 10).join('\n   ')}`);
console.log(
  fallidos.length ? `\n${fallidos.length} de ${checks.length} checks fallaron` : `\n${checks.length} checks OK`
);
process.exit(fallidos.length ? 1 : 0);

// Página del smoke: una "app" mínima sobre el dist del paquete, sin Vue ni router. La maneja scripts/smoke.mjs con
// playwright y lee `window.__smoke.state`. Rutas: /connect?host=&db= guarda el tenant y llama a login(); /callback
// canjea el code y vuelve al redirect del state; cualquier otra restaura la sesión y pega a /me y al menú.
// El dist se sirve desde la raíz del servidor del smoke: no hay bundler que resuelva un path relativo o un alias.
// oxlint-disable-next-line import/no-absolute-path
import { createOidcAuth, createOidcHttp } from '/dist/index.js';

const out = document.getElementById('out');
const state = { steps: [], ready: false };
window.__smoke = { state };

const log = (message, data) => {
  state.steps.push({ message, data });
  out.textContent += `${message}${data === undefined ? '' : ` ${JSON.stringify(data)}`}\n`;
};

const params = new URLSearchParams(location.search);
const tenant = params.has('host')
  ? { host: params.get('host'), db: params.get('db') }
  : JSON.parse(localStorage.getItem('smoke.tenant') || 'null');

if (!tenant) {
  log('sin tenant: abrí /connect?host=https://…&db=…');
  state.ready = true;
} else {
  localStorage.setItem('smoke.tenant', JSON.stringify(tenant));
  const auth = createOidcAuth({
    issuer: tenant,
    redirectUri: `${location.origin}/callback`,
    postLogoutRedirectUri: `${location.origin}/`
  });
  const http = createOidcHttp(auth, { baseURL: auth.getIssuer() });
  Object.assign(window.__smoke, { auth, http });
  auth.onSessionExpired(() => log('onSessionExpired'));
  auth.onUserChange((user) =>
    log('onUserChange', user && (user.sub || user.username || Object.keys(user).slice(0, 3)))
  );

  try {
    if (location.pathname === '/callback') {
      const { user, redirect } = await auth.handleCallback();
      sessionStorage.setItem('smoke.callback', JSON.stringify({ sub: user.profile.sub, scope: user.scope, redirect }));
      log('callback ok', { sub: user.profile.sub, redirect });
      // Como el router.replace(redirect) del componente de callback.
      location.replace(redirect);
    } else {
      const restored = await auth.restore();
      state.restored = restored !== null;
      state.callback = JSON.parse(sessionStorage.getItem('smoke.callback') || 'null');
      log('restore', { restored: state.restored, logged: auth.check() });
      if (location.pathname === '/connect') {
        log('login()');
        await auth.login({ redirect: '/' });
      } else if (!auth.check()) {
        state.logged = false;
        state.ready = true;
      } else {
        state.logged = true;
        const me = await http.get('/me');
        state.me = me.data;
        log('/me', Object.keys(me.data));
        const menu = await http.get('/menu/phpmen');
        state.menu = Array.isArray(menu.data) ? menu.data.length : typeof menu.data;
        log('/menu/phpmen', state.menu);
        state.token = auth.getToken();
        state.ready = true;
      }
    }
  } catch (error) {
    state.error = `${error?.error || ''} ${error?.message || error}`.trim();
    log(`ERROR ${state.error}`);
    state.ready = true;
  }
}

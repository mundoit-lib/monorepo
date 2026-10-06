// IMPORTANTE: setup.js debe importarse PRIMERO. Vuelca import.meta.env.VITE_* a
// la config de la librería antes de que cualquier componente (que importa
// `services/config`) se evalúe.
import './setup.js';

// UnoCSS (utility classes estilo Tailwind, como en todas las apps de Mundo IT).
import 'virtual:uno.css';

import { createApp } from 'vue';

// Quasar
import { Dialog, Loading, Notify, Quasar } from 'quasar';
import quasarIconSet from 'quasar/icon-set/material-icons';
import quasarLang from 'quasar/lang/es';
import '@quasar/extras/material-icons/material-icons.css';
import 'quasar/src/css/index.sass';

// Plugins @mundoit-lib — mismo patrón que los boot files de las apps reales
// (src/boot/{axios,auth,events}.js de una app *-frontend).
import { install as authPlugin } from '@mundoit-lib/plugin-vue-auth';
import { getAxiosInstance, install as axiosPlugin } from '@mundoit-lib/plugin-vue-axios';
// v1.0.2+ exporta named `eventsPlugin` (la 1.0.0 de las apps viejas tenía default export).
import { eventsPlugin } from '@mundoit-lib/plugin-vue-event';

// Plugin de la librería: registra TODOS los componentes globalmente.
// El subpath /plugin valida el export "./plugin" del package.
import HistrixPlugin from '@mundoit-lib/histrix-component-vue/plugin';

import App from './App.vue';
import router from './router.js';
import config from './setup.js';

const app = createApp(App);

app.use(Quasar, {
  plugins: { Notify, Dialog, Loading },
  lang: quasarLang,
  iconSet: quasarIconSet
});

// 1) Axios 2.x — baseURL = <host>/api/db/<db>. El refresh es de auth 2.x, así que
//    no se pasan db/clientID/clientSecret/fixURL (2.x los ignora y avisa).
app.use(axiosPlugin, {
  baseURL: `${config.apiUrl || ''}/api/db/${config.db || ''}`
});
const http = getAxiosInstance();
app.config.globalProperties.$axios = http;
app.config.globalProperties.$api = http;

// 2) Auth 2.x — endpoints relativos al baseURL de axios: /token (login y refresh)
//    y /me. Sin esto `/me` iba a la raíz del host y daba 404.
app.use(authPlugin, {
  http,
  router,
  oauth: { clientId: config.clientId || '', clientSecret: config.clientSecret || '' },
  endpoints: {
    login: '/token',
    me: '/me',
    logout: null // Histrix no tiene logout OAuth: sólo se limpia la sesión local
  }
});

// 3) Eventos — $events.fire/on/off + option `events:` en componentes.
//    La librería avisa por acá login-ok, loaded-user, update-favorit... Es
//    opcional: con VITE_NO_EVENTS=1 no se instala y la librería usa su bus interno
//    (sirve para probar una app sin plugin-vue-event).
if (!import.meta.env.VITE_NO_EVENTS) {
  app.use(eventsPlugin);
} else {
  console.info('[playground] plugin-vue-event deshabilitado (VITE_NO_EVENTS): bus interno de la librería.');
}

// 4) Router + guard de auth (patrón boot/router.js de referencia, simplificado:
//    acá no hay denyRoles). Las rutas con meta.public no requieren login.
app.use(router);
const auth = app.config.globalProperties.$auth;
router.beforeEach((to) => {
  if (to.meta.public || to.name === 'home') return true;
  const logged = (auth && typeof auth.check === 'function' && auth.check()) || !!localStorage.getItem('accessToken');
  if (!logged) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  return true;
});

// 5) Componentes de la librería (registro global vía install()). `?lang=en` arranca
//    en inglés (sirve para las pantallas de auth, que no tienen el toggle del header).
app.use(HistrixPlugin, { locale: new URLSearchParams(window.location.search).get('lang') || 'es' });

app.mount('#app');

import { createAuth, useAuth as vueAuth3, type VueAuth } from '@websanova/vue-auth';
//@ts-ignore
import authBase from '@websanova/vue-auth/dist/v2/vue-auth.esm';
//@ts-ignore
import driverHttpAxios from '@websanova/vue-auth/dist/drivers/http/axios.1.x.esm.js';
//@ts-ignore
import driverRouterVueRouter from '@websanova/vue-auth/dist/drivers/router/vue-router.2.x.esm.js';
import DriverAuthBearerLaravel from './laravaleBear';

// Variable global para almacenar la instancia de auth
let authInstance: VueAuth | null = null;

const optionAuthDefault = {
  drivers: {
    http: driverHttpAxios,
    auth: DriverAuthBearerLaravel,
    router: driverRouterVueRouter,
  },
  options: {
    rolesKey: 'role',
    fetchData: {
      url: `${process.env.API_URL}/me`,
      method: 'GET',
      interval: 30,
    },
    refreshData: { enabled: false },
    rememberkey: 'refreshToken',
    tokenDefaultKey: 'accessToken',
  },
};

export const install = {
  install: function (Vue: any, options: any = {}) {
    if (typeof Vue.version === 'string' && Vue.version.startsWith('3.')) {
      // Vue 3
      Vue.use(
        createAuth({
          ...optionAuthDefault,
          ...options,
        })
      );
      // Guardamos la instancia para Vue 3
      authInstance = vueAuth3();
      return;
    }

    // Vue 2
    Vue.use(authBase, {
      ...optionAuthDefault,
      ...options,
    });

    // Guardamos la instancia para Vue 2
    authInstance = Vue.auth || Vue.prototype.$auth;
  },
};

// Función unificada useAuth
export function useAuth() {
  // Para Vue 3, usamos el mecanismo de inject
  if (
    typeof window !== 'undefined' &&
    //@ts-ignore
    window.Vue &&
    //@ts-ignore
    window.Vue.version.startsWith('3.')
  ) {
    return vueAuth3();
  }

  return authInstance;
}

export default install;

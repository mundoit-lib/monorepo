import { isVue2, isVue3 } from 'vue-demi';
import type { App } from 'vue-demi';
import type { VueAuth } from '@websanova/vue-auth';

// Imports directos - Vue 3
import { createAuth, useAuth as vueAuth3 } from '@websanova/vue-auth';

// Imports directos - Vue 2
//@ts-ignore
import authBase from '@websanova/vue-auth/dist/v2/vue-auth.esm';

// Imports directos - Drivers
//@ts-ignore
import driverHttpAxios from '@websanova/vue-auth/dist/drivers/http/axios.1.x.esm.js';
//@ts-ignore
import driverRouterVueRouter from '@websanova/vue-auth/dist/drivers/router/vue-router.2.x.esm.js';

// Tu driver
import DriverAuthBearerLaravel from './laravaleBear';

// Tipos
interface AuthOptions {
  drivers?: {
    http?: any;
    auth?: any;
    router?: any;
  };
  options?: {
    rolesKey?: string;
    fetchData?: {
      url: string;
      method: string;
      interval?: number;
    };
    refreshData?: { enabled: boolean };
    rememberkey?: string;
    tokenDefaultKey?: string;
    [key: string]: any;
  };
}

// Estado global
let authInstance: VueAuth | null = null;

// Factory para opciones por defecto
function createDefaultOptions(customDriver?: any): AuthOptions {
  return {
    drivers: {
      http: driverHttpAxios,
      auth: customDriver || DriverAuthBearerLaravel,
      router: driverRouterVueRouter,
    },
    options: {
      rolesKey: 'role',
      fetchData: {
        url: `${process.env.API_URL || ''}/me`,
        method: 'GET',
        interval: 30,
      },
      refreshData: { enabled: false },
      rememberkey: 'refreshToken',
      tokenDefaultKey: 'accessToken',
    },
  };
}

// Deep merge helper
function deepMerge(target: any, source: any): any {
  const output = { ...target };
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  
  return output;
}

function isObject(item: any): boolean {
  return item && typeof item === 'object' && !Array.isArray(item);
}

// Plugin principal
export const VueAuthPlugin = {
  install(app: App, options: AuthOptions & { authDriver?: any } = {}) {
    if (!isVue2 && !isVue3) {
      throw new Error('Vue Auth: Unsupported Vue version. Please use Vue 2 or Vue 3.');
    }

    const { authDriver, ...restOptions } = options;
    const defaultOptions = createDefaultOptions(authDriver);
    const mergedOptions = deepMerge(defaultOptions, restOptions);

    try {
      if (isVue3) {
        app.use(createAuth(mergedOptions));
        authInstance = vueAuth3();
      } else if (isVue2) {
        app.use(authBase, mergedOptions);
        // @ts-ignore
        authInstance = app.auth || app.prototype.$auth;
      }
    } catch (error) {
      console.error('Vue Auth: Installation failed', error);
      throw error;
    }
  },
};

// Composable useAuth
export function useAuth(): VueAuth {
  if (isVue3) {
    try {
      const auth = vueAuth3();
      if (auth) return auth;
    } catch (error) {
      if (authInstance) return authInstance;
    }
    
    throw new Error(
      'Vue Auth: Not initialized. Make sure to call app.use(VueAuthPlugin) before using useAuth()'
    );
  }

  if (isVue2) {
    if (!authInstance) {
      throw new Error(
        'Vue Auth: Not initialized. Make sure to call Vue.use(VueAuthPlugin) before using useAuth()'
      );
    }
    return authInstance;
  }

  throw new Error('Vue Auth: Unsupported Vue version');
}

// Helper para obtener la instancia directamente
export function getAuthInstance(): VueAuth | null {
  return authInstance;
}

// Re-exportar tu driver
export { DriverAuthBearerLaravel };

// Re-exportar tipos útiles
export type { VueAuth, AuthOptions };

// Export por defecto y nombrado
export { VueAuthPlugin as install };
export default VueAuthPlugin;
import { isVue2, isVue3 } from 'vue-demi';
import { createAuth, useAuth as useAuth$1 } from '@websanova/vue-auth';
import authBase from '@websanova/vue-auth/dist/v2/vue-auth.esm';
import driverHttpAxios from '@websanova/vue-auth/dist/drivers/http/axios.1.x.esm.js';
import driverRouterVueRouter from '@websanova/vue-auth/dist/drivers/router/vue-router.2.x.esm.js';

// src/index.ts

// src/laravaleBear.ts
var laravel = {
  request: function(req, token) {
    this.drivers.http.setHeaders.call(this, req, {
      Authorization: "Bearer " + token
    });
  },
  response: function(res) {
    const accessToken = res.data.access_token;
    const refreshToken = res.data.refresh_token;
    const tokenExpireDate = res.data.expires_in + res.data.expires_in * 1e3 + Date.now();
    if (accessToken) {
      localStorage.setItem("refreshToken", refreshToken);
      localStorage.setItem("tokenExpireDate", tokenExpireDate);
      return accessToken;
    }
  }
};
var laravaleBear_default = laravel;

// src/index.ts
var authInstance = null;
function createDefaultOptions(customDriver) {
  return {
    drivers: {
      http: driverHttpAxios,
      auth: customDriver || laravaleBear_default,
      router: driverRouterVueRouter
    },
    options: {
      rolesKey: "role",
      fetchData: {
        url: `${process.env.API_URL || ""}/me`,
        method: "GET",
        interval: 30
      },
      refreshData: { enabled: false },
      rememberkey: "refreshToken",
      tokenDefaultKey: "accessToken"
    }
  };
}
function deepMerge(target, source) {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
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
function isObject(item) {
  return item && typeof item === "object" && !Array.isArray(item);
}
var VueAuthPlugin = {
  install(app, options = {}) {
    if (!isVue2 && !isVue3) {
      throw new Error("Vue Auth: Unsupported Vue version. Please use Vue 2 or Vue 3.");
    }
    const { authDriver, ...restOptions } = options;
    const defaultOptions = createDefaultOptions(authDriver);
    const mergedOptions = deepMerge(defaultOptions, restOptions);
    try {
      if (isVue3) {
        app.use(createAuth(mergedOptions));
        authInstance = useAuth$1();
      } else if (isVue2) {
        app.use(authBase, mergedOptions);
        authInstance = app.auth || app.prototype.$auth;
      }
    } catch (error) {
      console.error("Vue Auth: Installation failed", error);
      throw error;
    }
  }
};
function useAuth() {
  if (isVue3) {
    try {
      const auth = useAuth$1();
      if (auth) return auth;
    } catch (error) {
      if (authInstance) return authInstance;
    }
    throw new Error(
      "Vue Auth: Not initialized. Make sure to call app.use(VueAuthPlugin) before using useAuth()"
    );
  }
  if (isVue2) {
    if (!authInstance) {
      throw new Error(
        "Vue Auth: Not initialized. Make sure to call Vue.use(VueAuthPlugin) before using useAuth()"
      );
    }
    return authInstance;
  }
  throw new Error("Vue Auth: Unsupported Vue version");
}
function getAuthInstance() {
  return authInstance;
}
var index_default = VueAuthPlugin;

export { laravaleBear_default as DriverAuthBearerLaravel, VueAuthPlugin, index_default as default, getAuthInstance, VueAuthPlugin as install, useAuth };

'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var vueDemi = require('vue-demi');

var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

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
var createAuth;
var vueAuth3;
var authBase;
var driverHttpAxios;
var driverRouterVueRouter;
var authInstance = null;
var isInitialized = false;
function loadDependencies() {
  if (isInitialized) return;
  try {
    driverHttpAxios = __require("@websanova/vue-auth/dist/drivers/http/axios.1.x.esm.js").default;
    driverRouterVueRouter = __require("@websanova/vue-auth/dist/drivers/router/vue-router.2.x.esm.js").default;
    if (vueDemi.isVue3) {
      const vue3Module = __require("@websanova/vue-auth");
      createAuth = vue3Module.createAuth;
      vueAuth3 = vue3Module.useAuth;
    } else if (vueDemi.isVue2) {
      authBase = __require("@websanova/vue-auth/dist/v2/vue-auth.esm").default;
    }
    isInitialized = true;
  } catch (error) {
    console.error("Failed to load vue-auth dependencies:", error);
    throw new Error("Vue Auth: Failed to initialize dependencies.");
  }
}
function createDefaultOptions(customDriver) {
  loadDependencies();
  return {
    drivers: {
      http: driverHttpAxios,
      auth: customDriver || laravaleBear_default,
      // TU DRIVER por defecto
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
    loadDependencies();
    if (!vueDemi.isVue2 && !vueDemi.isVue3) {
      throw new Error("Vue Auth: Unsupported Vue version. Please use Vue 2 or Vue 3.");
    }
    const { authDriver, ...restOptions } = options;
    const defaultOptions = createDefaultOptions(authDriver);
    const mergedOptions = deepMerge(defaultOptions, restOptions);
    try {
      if (vueDemi.isVue3) {
        if (!createAuth) {
          throw new Error("Vue Auth: Failed to load Vue 3 auth module");
        }
        app.use(createAuth(mergedOptions));
        authInstance = vueAuth3();
      } else if (vueDemi.isVue2) {
        if (!authBase) {
          throw new Error("Vue Auth: Failed to load Vue 2 auth module");
        }
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
  if (vueDemi.isVue3) {
    try {
      if (vueAuth3) {
        const auth = vueAuth3();
        if (auth) return auth;
      }
    } catch (error) {
      if (authInstance) return authInstance;
    }
    throw new Error(
      "Vue Auth: Not initialized. Make sure to call app.use(VueAuthPlugin) before using useAuth()"
    );
  }
  if (vueDemi.isVue2) {
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

exports.DriverAuthBearerLaravel = laravaleBear_default;
exports.VueAuthPlugin = VueAuthPlugin;
exports.default = index_default;
exports.getAuthInstance = getAuthInstance;
exports.install = VueAuthPlugin;
exports.useAuth = useAuth;

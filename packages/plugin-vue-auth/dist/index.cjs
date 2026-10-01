'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var vueDemi = require('vue-demi');
var vueAuth = require('@websanova/vue-auth');
var authBase = require('@websanova/vue-auth/dist/v2/vue-auth.esm');
var driverHttpAxios = require('@websanova/vue-auth/dist/drivers/http/axios.1.x.esm.js');
var driverRouterVueRouter = require('@websanova/vue-auth/dist/drivers/router/vue-router.2.x.esm.js');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

var authBase__default = /*#__PURE__*/_interopDefault(authBase);
var driverHttpAxios__default = /*#__PURE__*/_interopDefault(driverHttpAxios);
var driverRouterVueRouter__default = /*#__PURE__*/_interopDefault(driverRouterVueRouter);

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
      http: driverHttpAxios__default.default,
      auth: customDriver || laravaleBear_default,
      router: driverRouterVueRouter__default.default
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
    if (!vueDemi.isVue2 && !vueDemi.isVue3) {
      throw new Error("Vue Auth: Unsupported Vue version. Please use Vue 2 or Vue 3.");
    }
    const { authDriver, ...restOptions } = options;
    const defaultOptions = createDefaultOptions(authDriver);
    const mergedOptions = deepMerge(defaultOptions, restOptions);
    try {
      if (vueDemi.isVue3) {
        app.use(vueAuth.createAuth(mergedOptions));
        authInstance = vueAuth.useAuth();
      } else if (vueDemi.isVue2) {
        app.use(authBase__default.default, mergedOptions);
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
      const auth = vueAuth.useAuth();
      if (auth) return auth;
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

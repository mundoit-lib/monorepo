import { VueAuthPlugin } from './vue';

export { AuthService, localStorageAdapter } from './AuthService';
export { AUTH_KEY, VueAuthPlugin, createVueAuth, getAuthInstance, useAuth } from './vue';
export type { AuthRedirect, RouterLike, VueAuth, VueAuthOptions } from './vue';
export type * from './types';

export { VueAuthPlugin as install };
/** @alias Compatibilidad con 1.x: `app.use(VueAuthPlugin)` e `import auth from`. */
export default VueAuthPlugin;

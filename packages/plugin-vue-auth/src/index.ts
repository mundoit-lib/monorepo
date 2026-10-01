import { VueAuthPlugin } from './vue';

export { AuthService, localStorageAdapter } from './AuthService';
export { AUTH_KEY, VueAuthPlugin, createVueAuth, getAuthInstance, useAuth } from './vue';
export type { AuthRedirect, RouterLike, VueAuth, VueAuthOptions } from './vue';
export type * from './types';

export { VueAuthPlugin as install };
export default VueAuthPlugin;

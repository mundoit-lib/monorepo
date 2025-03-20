import { VueAuth } from '@websanova/vue-auth';

declare const install: {
    install: (Vue: any, options?: any) => void;
};
declare function useAuth(): VueAuth | null;

export { install as default, install, useAuth };

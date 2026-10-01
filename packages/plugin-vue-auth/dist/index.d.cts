import { App } from 'vue-demi';
import { VueAuth } from '@websanova/vue-auth';
export { VueAuth } from '@websanova/vue-auth';

declare const laravel: {
    request: (req: any, token: string) => void;
    response: (res: any) => any;
};

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
        refreshData?: {
            enabled: boolean;
        };
        rememberkey?: string;
        tokenDefaultKey?: string;
        [key: string]: any;
    };
}
declare const VueAuthPlugin: {
    install(app: App, options?: AuthOptions & {
        authDriver?: any;
    }): void;
};
declare function useAuth(): VueAuth;
declare function getAuthInstance(): VueAuth | null;

export { type AuthOptions, laravel as DriverAuthBearerLaravel, VueAuthPlugin, VueAuthPlugin as default, getAuthInstance, VueAuthPlugin as install, useAuth };

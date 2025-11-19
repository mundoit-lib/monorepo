import { App } from 'vue-demi';

interface Vue2Constructor {
    prototype: any;
    mixin: (options: any) => void;
}
declare function plugin(app: App): void;
declare function plugin(Vue: Vue2Constructor): void;

export { plugin as default };

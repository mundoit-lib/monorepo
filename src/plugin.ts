import { isVue2, isVue3 } from 'vue-demi';
import type { App, ComponentOptions } from 'vue-demi';
import { useEventBus, type EventBusInstance } from './eventBus';

// Tipos para Vue 2
interface Vue2Constructor {
  prototype: any;
  mixin: (options: any) => void;
}

// Tipos para las opciones de componentes extendidas
interface ComponentWithEvents extends ComponentOptions {
  events?: Record<string, (...args: any[]) => void>;
}

// Tipo interno para los listeners almacenados
interface StoredListener {
  event: string;
  listener: any;
}

// Extensión de tipos para Vue 2
interface Vue2Instance {
  $options: ComponentWithEvents;
  _eventListeners?: StoredListener[];
  $events?: EventBusInstance;
}
// Sobrecarga de tipos para el plugin
function plugin(app: App): void;
function plugin(Vue: Vue2Constructor): void;
function plugin(VueOrApp: App | Vue2Constructor): void {
  const bus = useEventBus();

  if (isVue3) {
    // Vue 3
    const app = VueOrApp as App;
    app.config.globalProperties.$events = bus;
    
    app.mixin({
      beforeCreate(this: any) {
        if (typeof this.$options.events !== 'object') return;
        this._eventListeners = [] as StoredListener[];
        
        for (const [event, handler] of Object.entries(this.$options.events)) {
          // @ts-ignore
          const boundHandler = handler.bind(this);
          const listener = bus.on(event, boundHandler);
          this._eventListeners.push({ event, listener });
        }
      },
      beforeUnmount(this: any) {
        if (!this._eventListeners) return;
        
        for (const { event, listener } of this._eventListeners as StoredListener[]) {
          bus.off(event, listener);
        }
      },
    });
  } else if (isVue2) {
    // Vue 2
    const Vue = VueOrApp as Vue2Constructor;
    
    Object.defineProperty(Vue.prototype, '$events', {
      get() {
        return bus;
      },
    });
    
    Vue.mixin({
      beforeCreate(this: Vue2Instance) {
        if (typeof this.$options.events !== 'object') return;
        this._eventListeners = [];
        
        for (const [event, handler] of Object.entries(this.$options.events)) {
          const boundHandler = handler.bind(this);
          const listener = bus.on(event, boundHandler);
          this._eventListeners.push({ event, listener });
        }
      },
      beforeDestroy(this: Vue2Instance) {
        if (!this._eventListeners) return;
        
        for (const { event, listener } of this._eventListeners) {
          bus.off(event, listener);
        }
      },
    });
  }
}

export default plugin;
import mitt from 'mitt';
import { isVue3, isVue2 } from 'vue-demi';

// src/eventBus.ts
var eventBus = mitt();
var useEventBus = () => {
  return {
    emit(event, ...args) {
      eventBus.emit(event, args);
    },
    on(event, callback) {
      const listener = (args) => callback(...args);
      eventBus.on(event, listener);
      return listener;
    },
    fire(event, ...args) {
      eventBus.emit(event, args);
    },
    off(event, listener) {
      eventBus.off(event, listener);
    },
    once(event, callback) {
      const listener = (args) => callback(...args);
      const wrappedListener = (args) => {
        listener(args);
        eventBus.off(event, wrappedListener);
      };
      eventBus.on(event, wrappedListener);
      return wrappedListener;
    }
  };
};
function plugin(VueOrApp) {
  const bus = useEventBus();
  if (isVue3) {
    const app = VueOrApp;
    app.config.globalProperties.$events = bus;
    app.mixin({
      beforeCreate() {
        if (typeof this.$options.events !== "object") return;
        this._eventListeners = [];
        for (const [event, handler] of Object.entries(this.$options.events)) {
          const boundHandler = handler.bind(this);
          const listener = bus.on(event, boundHandler);
          this._eventListeners.push({ event, listener });
        }
      },
      beforeUnmount() {
        if (!this._eventListeners) return;
        for (const { event, listener } of this._eventListeners) {
          bus.off(event, listener);
        }
      }
    });
  } else if (isVue2) {
    const Vue = VueOrApp;
    Object.defineProperty(Vue.prototype, "$events", {
      get() {
        return bus;
      }
    });
    Vue.mixin({
      beforeCreate() {
        if (typeof this.$options.events !== "object") return;
        this._eventListeners = [];
        for (const [event, handler] of Object.entries(this.$options.events)) {
          const boundHandler = handler.bind(this);
          const listener = bus.on(event, boundHandler);
          this._eventListeners.push({ event, listener });
        }
      },
      beforeDestroy() {
        if (!this._eventListeners) return;
        for (const { event, listener } of this._eventListeners) {
          bus.off(event, listener);
        }
      }
    });
  }
}
var plugin_default = plugin;

export { eventBus, plugin_default as eventsPlugin, useEventBus };

import type { App } from 'vue';
import { EVENTS_KEY, type EventBus, eventBus } from './eventBus';

export interface EventsPluginOptions {
  /** Bus a usar en la app. Por defecto, el bus compartido `eventBus`. */
  bus?: EventBus;
}

type EventsOption = Record<string, (...args: any[]) => void>;

declare module 'vue' {
  interface ComponentCustomProperties {
    /** Bus de eventos de la app (`@mundoit-lib/plugin-vue-event`). */
    $events: EventBus;
  }

  interface ComponentCustomOptions {
    /** Listeners del bus: se registran en `beforeCreate` y se desregistran en `beforeUnmount`. */
    events?: EventsOption;
  }
}

interface StoredListener {
  event: string;
  listener: (...args: any[]) => void;
}

/**
 * Plugin de Vue 3: expone `$events`, hace `app.provide('mundoitEvents', bus)` y registra
 * la opción de componente `events: { 'nombre'() {} }`.
 */
function eventsPlugin(app: App, options: EventsPluginOptions = {}): void {
  const bus = options.bus ?? eventBus;
  const listeners = new WeakMap<object, StoredListener[]>();

  app.config.globalProperties.$events = bus;
  app.provide(EVENTS_KEY, bus);

  app.mixin({
    beforeCreate(this: any) {
      const events: EventsOption | undefined = this.$options.events;
      if (!events || typeof events !== 'object') return;

      const stored: StoredListener[] = [];
      for (const [event, handler] of Object.entries(events)) {
        if (typeof handler !== 'function') continue;
        stored.push({ event, listener: bus.on(event, handler.bind(this)) });
      }
      listeners.set(this, stored);
    },
    beforeUnmount(this: any) {
      const stored = listeners.get(this);
      if (!stored) return;
      for (const { event, listener } of stored) bus.off(event, listener);
      listeners.delete(this);
    }
  });
}

export default eventsPlugin;

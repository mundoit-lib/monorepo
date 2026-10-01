import { getCurrentInstance, onBeforeUnmount } from 'vue';
import { type EventBus, type EventListener, type EventName, useEventBus } from './eventBus';

export type UseEventsReturn = Pick<EventBus, 'emit' | 'on' | 'once' | 'off'>;

type AnyListener = (...args: any[]) => void;

interface Registration {
  event: EventName;
  listener: AnyListener;
  handler: AnyListener;
}

/**
 * Bus de eventos para Composition API. Lo que se registre con `on`/`once` desde un `setup`
 * se desregistra solo en `onBeforeUnmount`. Fuera de un componente se comporta como el bus.
 *
 * @param bus bus a usar; por defecto, el de la app (`install(app, { bus })`) o el bus por defecto.
 */
export function useEvents(bus: EventBus = useEventBus()): UseEventsReturn {
  const registrations: Registration[] = [];

  // Cada registro usa un handler propio, así el auto-off no saca listeners de otros componentes
  // que compartan la misma función.
  function add<K extends EventName>(event: K, listener: EventListener<K>, once: boolean): EventListener<K> {
    const fn = listener as AnyListener;
    const registration: Registration = { event, listener: fn, handler: fn };
    registration.handler = once
      ? (...args) => {
          remove(registration);
          fn(...args);
        }
      : (...args) => fn(...args);
    registrations.push(registration);
    bus.on(event, registration.handler as EventListener<K>);
    return listener;
  }

  function remove(registration: Registration): void {
    const index = registrations.indexOf(registration);
    if (index !== -1) registrations.splice(index, 1);
    bus.off(registration.event, registration.handler);
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      // Copia a propósito: remove() saca elementos de registrations mientras se recorre.
      // oxlint-disable-next-line unicorn/no-useless-spread
      for (const registration of [...registrations]) remove(registration);
    });
  }

  return {
    emit: (event, ...args) => bus.emit(event, ...args),
    on: (event, listener) => add(event, listener, false),
    once: (event, listener) => add(event, listener, true),
    off(event, listener) {
      const own = registrations.filter((r) => r.event === event && (!listener || r.listener === listener));
      for (const registration of own) remove(registration);
      if (!listener) bus.off(event);
      else if (!own.length) bus.off(event, listener);
    }
  };
}

import mitt, { type Emitter, type EventType, type Handler } from 'mitt';
import { getCurrentInstance, inject } from 'vue';

/**
 * Mapa de eventos de la app: nombre → tupla de argumentos.
 * Se extiende por module augmentation:
 *
 * ```ts
 * declare module '@mundoit-lib/plugin-vue-event' {
 *   interface MundoitEvents {
 *     'loaded-user': [user: User];
 *   }
 * }
 * ```
 *
 * Los eventos que no están declarados siguen aceptando cualquier argumento.
 */
// Vacía a propósito: se completa por module augmentation.
export interface MundoitEvents {}

/** Nombre de evento: los declarados en `MundoitEvents` (con autocompletado) o cualquier string. */
export type EventName = keyof MundoitEvents | (string & Record<never, never>);

/** Argumentos de un evento: la tupla declarada en `MundoitEvents`, o `any[]` si no está declarado. */
export type EventArgs<K extends EventName> = K extends keyof MundoitEvents
  ? MundoitEvents[K] extends unknown[]
    ? MundoitEvents[K]
    : [MundoitEvents[K]]
  : any[];

export type EventListener<K extends EventName = EventName> = (...args: EventArgs<K>) => void;

/** Emitter crudo de mitt: cada evento viaja con un único payload, el array de argumentos. */
export type RawEventBus = Emitter<Record<EventType, unknown[]>>;

export interface EventBus {
  /** Emite `event` con los argumentos dados; cada listener los recibe tal cual (`on('x', (a, b) => …)`). */
  emit<K extends EventName>(event: K, ...args: EventArgs<K>): void;
  /** Registra `listener` y lo devuelve, para pasarlo después a `off`. */
  on<K extends EventName>(event: K, listener: EventListener<K>): EventListener<K>;
  /** Como `on`, pero se desregistra solo después de la primera vez. */
  once<K extends EventName>(event: K, listener: EventListener<K>): EventListener<K>;
  /** Desregistra `listener` de `event`; sin `listener`, desregistra todos los de `event`. */
  off<K extends EventName>(event: K, listener?: EventListener<K>): void;
  /** @deprecated Se elimina en 3.0. Usar `emit`; se mantiene por compatibilidad con 1.x. */
  fire<K extends EventName>(event: K, ...args: EventArgs<K>): void;
  /** El emitter de mitt por debajo. Ojo: el payload de cada evento es el array de argumentos. */
  readonly rawBus: RawEventBus;
}

/** @deprecated Se elimina en 3.0. Nombre de 1.x, usar `EventBus`. */
export type EventBusInstance = EventBus;

/** @deprecated Se elimina en 3.0. Tipo de 1.x, usar `MundoitEvents`. */
export type EventBusEvents = Record<EventType, any>;

type AnyListener = (...args: any[]) => void;

let fireWarned = false;

function isDev(): boolean {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return false;
  }
}

/** Crea un bus de eventos independiente. */
export function createEventBus(): EventBus {
  const rawBus: RawEventBus = mitt();
  // listener del usuario → handlers de mitt que lo envuelven, por evento
  const registry = new Map<EventType, Map<AnyListener, Handler<unknown[]>[]>>();

  function register(event: EventType, listener: AnyListener, handler: Handler<unknown[]>): void {
    let byListener = registry.get(event);
    if (!byListener) {
      byListener = new Map();
      registry.set(event, byListener);
    }
    const handlers = byListener.get(listener);
    if (handlers) handlers.push(handler);
    else byListener.set(listener, [handler]);
    rawBus.on(event, handler);
  }

  function unregister(event: EventType, listener: AnyListener, handler?: Handler<unknown[]>): void {
    const byListener = registry.get(event);
    const handlers = byListener?.get(listener);
    if (!byListener || !handlers) return;
    const toRemove = handler ? handlers.filter((h) => h === handler) : handlers;
    for (const h of toRemove) rawBus.off(event, h);
    const rest = handler ? handlers.filter((h) => h !== handler) : [];
    if (rest.length) byListener.set(listener, rest);
    else byListener.delete(listener);
    if (!byListener.size) registry.delete(event);
  }

  const bus: EventBus = {
    rawBus,

    emit(event, ...args) {
      rawBus.emit(event, args);
    },

    on(event, listener) {
      register(event, listener, (args) => (listener as AnyListener)(...(args ?? [])));
      return listener;
    },

    once(event, listener) {
      const handler: Handler<unknown[]> = (args) => {
        unregister(event, listener, handler);
        (listener as AnyListener)(...(args ?? []));
      };
      register(event, listener, handler);
      return listener;
    },

    off(event, listener) {
      if (listener) {
        unregister(event, listener);
      } else {
        rawBus.off(event);
        registry.delete(event);
      }
    },

    fire(event, ...args) {
      if (!fireWarned && isDev()) {
        fireWarned = true;
        console.warn('[@mundoit-lib/plugin-vue-event] `fire` está deprecado y se elimina en 3.0, usar `emit`.');
      }
      bus.emit(event, ...args);
    }
  };

  return bus;
}

/** Bus por defecto: el que usa el plugin si no se le pasa otro. */
export const eventBus: EventBus = createEventBus();

/** Clave con la que el plugin hace `app.provide` del bus. */
export const EVENTS_KEY = 'mundoitEvents';

/**
 * Devuelve el bus de la app (el que se pasó a `install`) si se llama dentro de un `setup`,
 * o el bus por defecto si no. No desregistra nada solo: para eso está `useEvents`.
 */
export function useEventBus(): EventBus {
  return getCurrentInstance() ? inject<EventBus>(EVENTS_KEY, eventBus) : eventBus;
}

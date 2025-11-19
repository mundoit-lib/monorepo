import mitt, { type Emitter, type EventType, type Handler } from 'mitt';

// Define el tipo de eventos de tu aplicación
// Puedes extender este tipo según tus necesidades
export type EventBusEvents = Record<EventType, any>;

// Tipos para los listeners
type EventListener<T = any> = (args: T) => void;
type UnwrappedHandler<T = any> = (...args: any[]) => T;

// Exportamos una única instancia del event bus
export const eventBus: Emitter<EventBusEvents> = mitt<EventBusEvents>();

// Interface para el retorno de useEventBus
export interface EventBusInstance {
  emit<K extends keyof EventBusEvents>(event: K, ...args: any[]): void;
  on<K extends keyof EventBusEvents>(
    event: K,
    callback: UnwrappedHandler
  ): Handler<EventBusEvents[K]>;
  fire<K extends keyof EventBusEvents>(event: K, ...args: any[]): void;
  off<K extends keyof EventBusEvents>(
    event: K,
    listener: Handler<EventBusEvents[K]>
  ): void;
  once<K extends keyof EventBusEvents>(
    event: K,
    callback: UnwrappedHandler
  ): Handler<EventBusEvents[K]>;
}

// Exportamos helpers para usar en composables o archivos JS/TS
export const useEventBus = (): EventBusInstance => {
  return {
    emit<K extends keyof EventBusEvents>(event: K, ...args: any[]): void {
      eventBus.emit(event, args);
    },
    
    on<K extends keyof EventBusEvents>(
      event: K,
      callback: UnwrappedHandler
    ): Handler<EventBusEvents[K]> {
      const listener: Handler<EventBusEvents[K]> = (args: any) => callback(...args);
      eventBus.on(event, listener);
      return listener;
    },
    
    fire<K extends keyof EventBusEvents>(event: K, ...args: any[]): void {
      eventBus.emit(event, args);
    },
    
    off<K extends keyof EventBusEvents>(
      event: K,
      listener: Handler<EventBusEvents[K]>
    ): void {
      eventBus.off(event, listener);
    },
    
    once<K extends keyof EventBusEvents>(
      event: K,
      callback: UnwrappedHandler
    ): Handler<EventBusEvents[K]> {
      const listener: Handler<EventBusEvents[K]> = (args: any) => callback(...args);
      const wrappedListener: Handler<EventBusEvents[K]> = (args: any) => {
        listener(args);
        eventBus.off(event, wrappedListener);
      };
      eventBus.on(event, wrappedListener);
      return wrappedListener;
    }
  };
};
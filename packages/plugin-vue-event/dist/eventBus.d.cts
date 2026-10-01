import { EventType, Emitter, Handler } from 'mitt';

type EventBusEvents = Record<EventType, any>;
type UnwrappedHandler<T = any> = (...args: any[]) => T;
declare const eventBus: Emitter<EventBusEvents>;
interface EventBusInstance {
    emit<K extends keyof EventBusEvents>(event: K, ...args: any[]): void;
    on<K extends keyof EventBusEvents>(event: K, callback: UnwrappedHandler): Handler<EventBusEvents[K]>;
    fire<K extends keyof EventBusEvents>(event: K, ...args: any[]): void;
    off<K extends keyof EventBusEvents>(event: K, listener: Handler<EventBusEvents[K]>): void;
    once<K extends keyof EventBusEvents>(event: K, callback: UnwrappedHandler): Handler<EventBusEvents[K]>;
}
declare const useEventBus: () => EventBusInstance;

export { type EventBusEvents, type EventBusInstance, eventBus, useEventBus };

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEventBus, eventBus } from './eventBus';

describe('createEventBus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emit llega a on con los argumentos desenvueltos', () => {
    const bus = createEventBus();
    const listener = vi.fn();
    bus.on('saved', listener);

    bus.emit('saved', 1, 'dos', { tres: 3 });

    expect(listener).toHaveBeenCalledWith(1, 'dos', { tres: 3 });
  });

  it('emit sin argumentos llama al listener sin argumentos', () => {
    const bus = createEventBus();
    const listener = vi.fn();
    bus.on('ping', listener);

    bus.emit('ping');

    expect(listener).toHaveBeenCalledWith();
  });

  it('on devuelve el listener, que sirve para off', () => {
    const bus = createEventBus();
    const listener = vi.fn();
    const handle = bus.on('saved', listener);

    bus.off('saved', handle);
    bus.emit('saved');

    expect(handle).toBe(listener);
    expect(listener).not.toHaveBeenCalled();
  });

  it('off con el listener original saca sólo ese listener', () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('saved', a);
    bus.on('saved', b);

    bus.off('saved', a);
    bus.emit('saved');

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });

  it('off sin listener saca todos los del evento y no toca otros eventos', () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    const other = vi.fn();
    bus.on('saved', a);
    bus.on('saved', b);
    bus.on('other', other);

    bus.off('saved');
    bus.emit('saved');
    bus.emit('other');

    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalledOnce();
  });

  it('once se ejecuta una sola vez', () => {
    const bus = createEventBus();
    const listener = vi.fn();
    bus.once('saved', listener);

    bus.emit('saved', 'a');
    bus.emit('saved', 'b');

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith('a');
  });

  it('once se puede cancelar con off antes de emitir', () => {
    const bus = createEventBus();
    const listener = vi.fn();
    bus.once('saved', listener);

    bus.off('saved', listener);
    bus.emit('saved');

    expect(listener).not.toHaveBeenCalled();
  });

  it('los buses son independientes entre sí y del bus por defecto', () => {
    const a = createEventBus();
    const b = createEventBus();
    const onA = vi.fn();
    const onB = vi.fn();
    const onDefault = vi.fn();
    a.on('saved', onA);
    b.on('saved', onB);
    eventBus.on('saved', onDefault);

    a.emit('saved');

    expect(onA).toHaveBeenCalledOnce();
    expect(onB).not.toHaveBeenCalled();
    expect(onDefault).not.toHaveBeenCalled();
    eventBus.off('saved', onDefault);
  });

  it('fire es alias de emit y avisa una sola vez', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bus = createEventBus();
    const listener = vi.fn();
    bus.on('saved', listener);

    bus.fire('saved', 1, 2);
    bus.fire('saved', 3);
    createEventBus().fire('saved');

    expect(listener).toHaveBeenNthCalledWith(1, 1, 2);
    expect(listener).toHaveBeenNthCalledWith(2, 3);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('rawBus recibe el array de argumentos', () => {
    const bus = createEventBus();
    const raw = vi.fn();
    bus.rawBus.on('saved', raw);

    bus.emit('saved', 1, 2);

    expect(raw).toHaveBeenCalledWith([1, 2]);
  });
});

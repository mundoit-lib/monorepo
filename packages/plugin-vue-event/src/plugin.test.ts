// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Component, createApp, defineComponent, h, inject, nextTick, ref } from 'vue';
import { EVENTS_KEY, type EventBus, createEventBus, eventBus } from './eventBus';
import eventsPlugin from './plugin';
import { useEvents } from './useEvents';

function mount(component: Component, bus?: EventBus) {
  const el = document.createElement('div');
  const app = createApp(component);
  app.use(eventsPlugin, bus ? { bus } : undefined);
  const vm = app.mount(el);
  return { app, vm };
}

describe('eventsPlugin', () => {
  afterEach(() => {
    eventBus.off('saved');
  });

  it('expone $events y lo provee con la clave mundoitEvents', () => {
    let injected: EventBus | undefined;
    const { vm } = mount(
      defineComponent({
        setup() {
          injected = inject<EventBus>(EVENTS_KEY);
          return () => h('div');
        }
      })
    );

    expect(vm.$events).toBe(eventBus);
    expect(injected).toBe(eventBus);
    expect(EVENTS_KEY).toBe('mundoitEvents');
  });

  it('install(app, { bus }) usa el bus propio', () => {
    const bus = createEventBus();
    const { vm } = mount(defineComponent({ render: () => h('div') }), bus);

    expect(vm.$events).toBe(bus);
  });

  it('la opción events: registra con this del componente y desregistra al desmontar', () => {
    const received = vi.fn();
    const { app } = mount(
      defineComponent({
        data: () => ({ name: 'comp' }),
        events: {
          saved(this: { name: string }, ...args: unknown[]) {
            received(this.name, ...args);
          }
        },
        render: () => h('div')
      })
    );

    eventBus.emit('saved', 1, 2);
    expect(received).toHaveBeenCalledWith('comp', 1, 2);

    app.unmount();
    eventBus.emit('saved', 3);
    expect(received).toHaveBeenCalledOnce();
  });

  it('$events.fire sigue llegando a la opción events: (compat 1.x)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const received = vi.fn();
    const Listener = defineComponent({ events: { saved: received }, render: () => h('div') });
    const Emitter = defineComponent({
      mounted() {
        this.$events.fire('saved', 'hola');
      },
      render: () => h('div')
    });
    mount(defineComponent({ render: () => [h(Listener), h(Emitter)] }));

    expect(received).toHaveBeenCalledWith('hola');
  });

  it('un hijo que se desmonta saca sólo sus listeners', async () => {
    const received = vi.fn();
    const Child = defineComponent({
      props: { id: Number },
      events: {
        saved(this: { id: number }) {
          received(this.id);
        }
      },
      render: () => h('div')
    });
    const show = ref(true);
    mount(defineComponent({ setup: () => () => [h(Child, { id: 1 }), show.value ? h(Child, { id: 2 }) : null] }));

    show.value = false;
    await nextTick();
    eventBus.emit('saved');

    expect(received.mock.calls).toEqual([[1]]);
  });
});

describe('useEvents', () => {
  afterEach(() => {
    eventBus.off('saved');
  });

  it('on/once registrados en setup se desregistran al desmontar', () => {
    const onListener = vi.fn();
    const onceListener = vi.fn();
    const { app } = mount(
      defineComponent({
        setup() {
          const events = useEvents();
          events.on('saved', onListener);
          events.once('saved', onceListener);
          return () => h('div');
        }
      })
    );

    eventBus.emit('saved', 1);
    expect(onListener).toHaveBeenCalledWith(1);
    expect(onceListener).toHaveBeenCalledOnce();

    app.unmount();
    eventBus.emit('saved', 2);
    expect(onListener).toHaveBeenCalledOnce();
  });

  it('usa el bus que se pasó a install', () => {
    const bus = createEventBus();
    const listener = vi.fn();
    mount(
      defineComponent({
        setup() {
          useEvents().on('saved', listener);
          return () => h('div');
        }
      }),
      bus
    );

    eventBus.emit('saved');
    bus.emit('saved');

    expect(listener).toHaveBeenCalledOnce();
  });

  it('el auto-off no saca la misma función registrada por otro componente', () => {
    const shared = vi.fn();
    const Child = defineComponent({
      setup() {
        useEvents().on('saved', shared);
        return () => h('div');
      }
    });
    const show = ref(true);
    mount(defineComponent({ setup: () => () => [h(Child), show.value ? h(Child) : null] }));

    show.value = false;
    return nextTick().then(() => {
      eventBus.emit('saved');
      expect(shared).toHaveBeenCalledOnce();
    });
  });

  it('off saca el listener antes del desmontaje', () => {
    const listener = vi.fn();
    mount(
      defineComponent({
        setup() {
          const events = useEvents();
          events.on('saved', listener);
          events.off('saved', listener);
          return () => h('div');
        }
      })
    );

    eventBus.emit('saved');

    expect(listener).not.toHaveBeenCalled();
  });

  it('emit emite en el bus', () => {
    const listener = vi.fn();
    eventBus.on('saved', listener);

    useEvents().emit('saved', 'x');

    expect(listener).toHaveBeenCalledWith('x');
  });

  it('fuera de un componente no registra hooks y funciona como el bus', () => {
    const warn = vi.spyOn(console, 'warn');
    const listener = vi.fn();
    const events = useEvents();
    events.on('saved', listener);

    eventBus.emit('saved');
    events.off('saved', listener);
    eventBus.emit('saved');

    expect(listener).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

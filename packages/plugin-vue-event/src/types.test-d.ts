import { describe, expectTypeOf, it } from 'vitest';
import { createEventBus } from './eventBus';

// Test de tipos: Vitest lo valida con tsc (typecheck en vitest.config.ts), no se ejecuta en runtime.
declare module './eventBus' {
  interface MundoitEvents {
    'test:typed': [id: number, label: string];
    'test:single': string;
  }
}

describe('tipado por MundoitEvents', () => {
  it('emit y on usan la tupla declarada', () => {
    const bus = createEventBus();

    bus.emit('test:typed', 1, 'uno');
    bus.on('test:typed', (id, label) => {
      expectTypeOf(id).toEqualTypeOf<number>();
      expectTypeOf(label).toEqualTypeOf<string>();
    });
    bus.on('test:single', (value) => {
      expectTypeOf(value).toEqualTypeOf<string>();
    });

    // @ts-expect-error falta el label
    bus.emit('test:typed', 1);
    // @ts-expect-error id tiene que ser number
    bus.emit('test:typed', '1', 'uno');
  });

  it('un evento no declarado acepta cualquier argumento', () => {
    const bus = createEventBus();

    bus.emit('cualquiera', 1, 'dos', {});
    bus.on('cualquiera', (...args) => {
      expectTypeOf(args).toEqualTypeOf<any[]>();
    });
  });
});

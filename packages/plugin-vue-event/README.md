# @mundoit-lib/plugin-vue-event

Bus de eventos global para Vue 3, sobre [mitt](https://github.com/developit/mitt). Expone `$events`, la opción de componente `events:` y el composable `useEvents()`, que desregistra solo al desmontar. Los eventos se pueden tipar por module augmentation.

## Instalación

```bash
pnpm add @mundoit-lib/plugin-vue-event
```

```ts
import { createApp } from 'vue';
import { eventsPlugin } from '@mundoit-lib/plugin-vue-event';

createApp(App).use(eventsPlugin).mount('#app');
```

`install` hace tres cosas:

- `app.config.globalProperties.$events = bus`;
- `app.provide('mundoitEvents', bus)` (la clave está exportada como `EVENTS_KEY`);
- un mixin global que registra la opción `events:` de cada componente.

Por defecto usa `eventBus`, el bus compartido del paquete. Para usar uno propio:

```ts
import { createEventBus, eventsPlugin } from '@mundoit-lib/plugin-vue-event';

const bus = createEventBus();
app.use(eventsPlugin, { bus });
```

## API del bus

```ts
bus.emit('saved', id, data);              // los listeners reciben (id, data)
const fn = bus.on('saved', (id, data) => {});
bus.once('saved', (id) => {});
bus.off('saved', fn);                     // saca ese listener
bus.off('saved');                         // saca todos los de 'saved'
```

- `on` y `once` devuelven el mismo listener que reciben, así que `off` funciona con el handle o con la función original.
- `createEventBus()` crea buses independientes; `eventBus` es el que se comparte por defecto.
- `bus.rawBus` es el emitter de mitt. Ojo: cada evento viaja con **un solo payload, el array de argumentos** (`rawBus.on('saved', ([id, data]) => {})`). Usarlo sólo si hace falta algo de mitt que el bus no expone (por ejemplo `rawBus.all`).

## Opción `events:` (Options API)

```ts
export default {
  events: {
    'loaded-user'(user) {
      this.user = user; // `this` es el componente
    }
  },
  methods: {
    save() {
      this.$events.emit('saved', this.id);
    }
  }
};
```

Los listeners se registran en `beforeCreate` y se desregistran en `beforeUnmount`.

## `useEvents()` (Composition API)

```ts
import { useEvents } from '@mundoit-lib/plugin-vue-event';

const events = useEvents();
events.on('loaded-user', (user) => { /* … */ });   // se desregistra solo al desmontar
events.once('ready', () => { /* … */ });
events.emit('saved', id);
```

- Dentro de un `setup` usa el bus de la app (el que se pasó a `install`); también se le puede pasar uno: `useEvents(bus)`.
- Lo que se registra con `on`/`once` se desregistra en `onBeforeUnmount`. `off` lo saca antes.
- Fuera de un componente se comporta como el bus y no desregistra nada solo.

`useEventBus()` devuelve el bus de la app (o `eventBus` fuera de un componente) sin auto-desregistro, como en 1.x.

## Tipado

Por defecto cualquier nombre de evento acepta cualquier argumento. Para tipar los de la app, declarar `MundoitEvents` (en un `.d.ts` o en cualquier archivo incluido en el `tsconfig`):

```ts
import type { User } from '@/types';

declare module '@mundoit-lib/plugin-vue-event' {
  interface MundoitEvents {
    'loaded-user': [user: User];
    saved: [id: number, data?: unknown];
  }
}
```

Con eso `emit`, `on`, `once`, `off` y `$events` controlan los argumentos de esos eventos y los autocompletan. Los eventos no declarados siguen siendo `any`.

## Deprecado (se elimina en 3.0)

Siguen andando en 2.x por compatibilidad con 1.x y se sacan en la 3.0.

| Qué | Reemplazo |
|---|---|
| `fire()` (`$events.fire`, `eventBus.fire`) | `emit()` |
| Tipos `EventBusInstance`, `EventBusEvents` | `EventBus`, `MundoitEvents` |

## Migración 1.x → 2.0

| 1.x | 2.0 |
|---|---|
| Vue 2 y Vue 3 | **Sólo Vue 3** (`vue ^3.3`). En Vue 2 quedarse en 1.x. |
| `$events.fire(...)` | Sigue andando, pero está deprecado (se elimina en 3.0): usar `$events.emit(...)`. En desarrollo avisa una vez por consola. |
| `useEventBus()` | Sigue igual. Para componentes, mejor `useEvents()`, que desregistra solo. |
| `off(evento, handle)` con el valor que devolvía `on` | Igual, y además acepta la función original o sólo el evento. |
| `EventBusInstance`, `EventBusEvents` | Deprecados (se eliminan en 3.0): usar `EventBus` y `MundoitEvents`. |
| `eventBus` era el emitter de mitt | `eventBus` es el bus (`emit`/`on`/…); el emitter de mitt está en `eventBus.rawBus`. |
| Dependencias de compatibilidad con Vue 2 | Ya no hacen falta: se pueden sacar de la app si nadie más los usa. |

Para una app en Vue 3 que usa `events:` y `$events`, actualizar es sólo subir la versión.

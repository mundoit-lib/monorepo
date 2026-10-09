/**
 * Validación de los tipos del menú (no se publica). Lo corre `typecheck`.
 */
import { ref } from 'vue';
import type {
  HistrixExpansionMenuSlots,
  HistrixMenu,
  HistrixMenuNode,
  HistrixSystemMenu,
  HistrixSystemMenuSlots
} from '../index';
import { useHistrixMenu, useHistrixSystemMenu } from '../index';

const level = ref('phpmen');
const menu: HistrixMenu = useHistrixMenu({ level, favorites: () => true, onClose: () => undefined });
useHistrixMenu({ level: 'phpmen-fsm' });
useHistrixMenu();

const first: HistrixMenuNode | undefined = menu.tree.value[0];
if (first) {
  const path: string = menu.nodeUri(first).path;
  const text: string = menu.label(first.label);
  menu.open(first);
  void menu.toggleFavorite(first);
  void [path, text];
}
const fav = menu.favorites.value[0];
if (fav) void menu.toggleFavorite(fav);
const open: boolean = menu.featuredOpen.value && menu.favoritesOpen.value && !menu.loading.value;
void open;

// @ts-expect-error level es un string
useHistrixMenu({ level: 1 });

const leaf = {} as HistrixExpansionMenuSlots['leaf'];
const isFav: boolean = leaf.isFavorite && leaf.favoritesEnabled;
leaf.onClick();
void [isFav, leaf.toggleFavorite()];
// @ts-expect-error la sección es 'featured' o 'favorites'
const section: HistrixExpansionMenuSlots['section-header']['section'] = 'otra';
void section;

const system: HistrixSystemMenu = useHistrixSystemMenu({ immediate: false, onClose: () => undefined });
useHistrixSystemMenu({ enabled: ref(true) });
useHistrixSystemMenu();
const showGear: boolean = system.enabled.value && !system.loading.value;
for (const entry of system.entries.value) {
  if (!entry.header) system.open(entry.node);
}
void [showGear, system.load(), system.reload()];
// @ts-expect-error enabled es booleano
useHistrixSystemMenu({ enabled: 'si' });

const item = {} as HistrixSystemMenuSlots['item'];
const depth: number = item.depth;
item.onClick();
void depth;

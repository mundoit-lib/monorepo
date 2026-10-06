/**
 * Menú lateral: `useHistrixMenu` (composables/useHistrixMenu.js) y los slots de
 * `HistrixExpansionMenu`, para que la app cambie el diseño sin reimplementar la lógica.
 */
import type { MaybeRefOrGetter, Ref } from 'vue';

/** Item del árbol que devuelve `getMenu(level)`. Con `children` es una rama; sin, una hoja. */
export interface HistrixMenuNode {
  menuId?: string | number;
  key?: string | number;
  /** Puede traer entidades HTML (`&oacute;`): mostrarlo con `menu.label()`. */
  label: string;
  subtitle?: string;
  icon?: string;
  /** `dir/archivo.xml` de Histrix o `...vue=ruta/de/la/app`. */
  uri: string;
  children?: HistrixMenuNode[];
  [key: string]: unknown;
}

/** Favorito guardado del usuario. */
export interface HistrixMenuFavorite {
  menuId: string | number;
  uri: string;
  name: string;
}

/** Ruta de un item, lista para `:to` o `router.push`. */
export interface HistrixMenuLocation {
  path: string;
  query?: { _title: string };
}

export interface UseHistrixMenuOptions {
  /** Nivel que se pide a `getMenu` (`'phpmen'`, `'phpmen-fsm'`…). */
  level?: MaybeRefOrGetter<string | undefined>;
  /** Habilita los favoritos del usuario. Default `false`. */
  favorites?: MaybeRefOrGetter<boolean>;
  /** Árbol ya cargado: no se pide el menú. */
  tree?: HistrixMenuNode[] | null;
  /** Se llama al elegir un item (cerrar el drawer). */
  onClose?: () => void;
  /** Se llama al agregar o quitar un favorito (además del `update-favorit` del bus). */
  onFavoritesChange?: () => void;
}

export interface HistrixMenu {
  tree: Ref<HistrixMenuNode[]>;
  featured: Ref<HistrixMenuNode[]>;
  favorites: Ref<HistrixMenuFavorite[]>;
  loading: Ref<boolean>;
  /** Sección de destacados abierta; se guarda en el storage (`menu.featuredOpen`). */
  featuredOpen: Ref<boolean>;
  /** Sección de favoritos abierta; se guarda en el storage (`menu.favoritesOpen`). */
  favoritesOpen: Ref<boolean>;
  favoritesEnabled(): boolean;
  isFavorite(menuId: HistrixMenuNode['menuId']): boolean;
  /** Agrega o quita el favorito (pide a la API, notifica y emite `update-favorit` por el bus). */
  toggleFavorite(item: HistrixMenuNode | HistrixMenuFavorite): Promise<void>;
  nodeUri(node: Pick<HistrixMenuNode, 'uri' | 'label'>): HistrixMenuLocation;
  /** Navega al item y llama a `onClose`. Para diseños sin `:to`. */
  open(node: Pick<HistrixMenuNode, 'uri' | 'label'>): void;
  /** `@click` de un item con `:to="nodeUri(node)"`: llama a `onClose` y recarga si es la ruta actual. */
  onItemClick(node: Pick<HistrixMenuNode, 'uri' | 'label'>): void;
  /** Texto con las entidades HTML decodificadas. */
  label(text: string | null | undefined): string;
  /** Vuelve a pedir el menú (y los favoritos, si están habilitados). */
  reload(): Promise<void>;
}

export declare function useHistrixMenu(options?: UseHistrixMenuOptions): HistrixMenu;

interface HistrixMenuItemSlotProps {
  to: HistrixMenuLocation;
  /** Texto decodificado, sin pasar a minúsculas. */
  label: string;
  /** `@click` del item si se usa `:to` (cierra el drawer). */
  onClick: () => void;
  /** Navega y cierra el drawer, si el diseño no usa `:to`. */
  open: () => void;
}

/** Props de los scoped slots de `HistrixExpansionMenu`. */
export interface HistrixExpansionMenuSlots {
  loading: Record<string, never>;
  'section-header': { section: 'featured' | 'favorites'; count: number; open: boolean };
  'featured-item': HistrixMenuItemSlotProps & { node: HistrixMenuNode; subtitle: string };
  'favorite-item': HistrixMenuItemSlotProps & { favorite: HistrixMenuFavorite; toggleFavorite: () => Promise<void> };
  'branch-header': { node: HistrixMenuNode; label: string; subtitle: string };
  leaf: HistrixMenuItemSlotProps & {
    node: HistrixMenuNode;
    subtitle: string;
    favoritesEnabled: boolean;
    isFavorite: boolean;
    toggleFavorite: () => Promise<void>;
  };
}

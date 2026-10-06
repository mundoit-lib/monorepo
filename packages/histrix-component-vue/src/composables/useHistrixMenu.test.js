import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import config from '../services/config.js';
import { createMemoryStorage } from '../services/storage.js';
import { useHistrixMenu } from './useHistrixMenu.js';

const api = vi.hoisted(() => ({
  getMenu: vi.fn(),
  getFavorites: vi.fn(),
  setFavorit: vi.fn(),
  removeFavorit: vi.fn()
}));
vi.mock('../services/histrixApi.js', () => ({ default: () => api }));

const tree = [
  { menuId: 1, label: 'Ventas', children: [{ menuId: 2, label: 'Facturaci&oacute;n', uri: 'ventas/fac.xml' }] },
  { menuId: 3, label: 'Panel', uri: 'histrix.php?vue=panel%2Fvista' }
];
const featured = [{ menuId: 4, label: 'Clientes', uri: 'ventas/cli.xml' }];

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let storage;
let navigations;

beforeEach(() => {
  storage = createMemoryStorage();
  navigations = [];
  config.storage = storage;
  config.onNavigate = (to, options) => navigations.push({ to, options });
  api.getMenu.mockResolvedValue({ data: { tree, featured } });
  api.getFavorites.mockResolvedValue({ keys: [{ menuId: 2, uri: 'ventas/fac.xml', name: 'facturación' }] });
  api.setFavorit.mockResolvedValue({});
  api.removeFavorit.mockResolvedValue({});
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  config.storage = undefined;
  config.onNavigate = undefined;
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('useHistrixMenu', () => {
  it('pide el menú del nivel y carga árbol, destacados y favoritos', async () => {
    const menu = useHistrixMenu({ level: 'phpmen', favorites: true });
    expect(menu.loading.value).toBe(true);
    await flush();
    expect(api.getMenu).toHaveBeenCalledWith('phpmen');
    expect(menu.loading.value).toBe(false);
    expect(menu.tree.value).toEqual(tree);
    expect(menu.featured.value).toEqual(featured);
    expect(menu.isFavorite(2)).toBe(true);
    expect(menu.isFavorite(3)).toBe(false);
  });

  it('sin favoritos habilitados no los pide; con `tree` no pide el menú', async () => {
    const menu = useHistrixMenu({ level: 'phpmen' });
    await flush();
    expect(api.getFavorites).not.toHaveBeenCalled();
    expect(menu.favoritesEnabled()).toBe(false);

    api.getMenu.mockClear();
    const child = useHistrixMenu({ tree: tree[0].children });
    expect(child.loading.value).toBe(false);
    expect(child.tree.value).toEqual(tree[0].children);
    expect(api.getMenu).not.toHaveBeenCalled();
  });

  it('si getMenu falla termina de cargar con el árbol vacío', async () => {
    api.getMenu.mockRejectedValue(new Error('500'));
    const menu = useHistrixMenu({ level: 'phpmen' });
    await flush();
    expect(menu.loading.value).toBe(false);
    expect(menu.tree.value).toEqual([]);
  });

  it('reload vuelve a pedir con el level actual (acepta getter)', async () => {
    let level = 'phpmen';
    const menu = useHistrixMenu({ level: () => level });
    await flush();
    level = 'phpmen-fsm';
    api.getMenu.mockResolvedValue({ data: { tree: [tree[1]] } });
    await menu.reload();
    expect(api.getMenu).toHaveBeenLastCalledWith('phpmen-fsm');
    expect(menu.tree.value).toEqual([tree[1]]);
    expect(menu.featured.value).toEqual([]);
  });

  it('toggleFavorite agrega y quita, avisa por onFavoritesChange', async () => {
    const onFavoritesChange = vi.fn();
    const menu = useHistrixMenu({ level: 'phpmen', favorites: true, onFavoritesChange });
    await flush();

    await menu.toggleFavorite(tree[1]);
    expect(api.setFavorit).toHaveBeenCalledWith(3, tree[1].uri, 'panel');
    expect(menu.isFavorite(3)).toBe(true);

    await menu.toggleFavorite(menu.favorites.value[0]);
    expect(api.removeFavorit).toHaveBeenCalledWith(2);
    expect(menu.isFavorite(2)).toBe(false);
    expect(onFavoritesChange).toHaveBeenCalledTimes(2);
  });

  it('si la API del favorito falla no cambia la lista', async () => {
    api.setFavorit.mockRejectedValue(new Error('500'));
    const onFavoritesChange = vi.fn();
    const menu = useHistrixMenu({ level: 'phpmen', favorites: true, onFavoritesChange });
    await flush();
    await menu.toggleFavorite(tree[1]);
    expect(menu.isFavorite(3)).toBe(false);
    expect(onFavoritesChange).not.toHaveBeenCalled();
  });

  it('las secciones abiertas se leen y guardan en el storage', async () => {
    storage.set('menu.favoritesOpen', '0');
    const menu = useHistrixMenu({ level: 'phpmen' });
    expect(menu.featuredOpen.value).toBe(true);
    expect(menu.favoritesOpen.value).toBe(false);
    menu.featuredOpen.value = false;
    await nextTick();
    expect(storage.get('menu.featuredOpen')).toBe('0');
  });

  it('nodeUri arma la ruta de un xml y de un `vue=`; label decodifica entidades', () => {
    const menu = useHistrixMenu({ tree: [] });
    expect(menu.nodeUri({ uri: 'ventas/fac.xml', label: 'Fac' })).toEqual({
      path: '/auth/ventas/fac.xml',
      query: { _title: 'Fac' }
    });
    expect(menu.nodeUri(tree[1])).toEqual({ path: '/panel/vista' });
    expect(menu.label('Facturaci&oacute;n &amp; cobro &#233;')).toBe('Facturación & cobro é');
    expect(menu.label(null)).toBe('');
  });

  it('open navega y cierra; onItemClick sólo cierra (navega el :to)', () => {
    const onClose = vi.fn();
    const menu = useHistrixMenu({ tree: [], onClose });
    menu.open(tree[1]);
    expect(navigations).toEqual([{ to: { path: '/panel/vista' }, options: { replace: false, back: false } }]);
    menu.onItemClick(featured[0]);
    expect(navigations).toHaveLength(1);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

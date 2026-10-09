// Lógica del menú lateral (HistrixExpansionMenu), separada del diseño:
//
//   const menu = useHistrixMenu({ level: 'phpmen', favorites: true, onClose: () => (drawer.value = false) });
//   menu.tree / menu.featured / menu.favorites / menu.loading / menu.toggleFavorite(node) / menu.open(node)
//
// Una app que quiere otro diseño usa los slots de HistrixExpansionMenu (que se apoya en este composable)
// o arma su propio componente con él. El estado se comparte con los niveles anidados por provide/inject.
import { getCurrentInstance, inject, provide, ref, toValue, watch } from 'vue';
import { menuNodeRoute as nodeUri } from '../core/menuRoute.js';
import { useHistrixBus } from '../services/bus.js';
import useApi from '../services/histrixApi.js';
import { useHistrixI18n } from '../services/i18n.js';
import { useHistrixNavigate } from '../services/navigation.js';
import { useHistrixNotify } from '../services/notify.js';
import { useHistrixStorage } from '../services/storage.js';

const HISTRIX_MENU_KEY = Symbol('histrixMenu');

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  iexcl: '¡',
  iquest: '¿',
  ordf: 'ª',
  ordm: 'º',
  deg: '°',
  laquo: '«',
  raquo: '»'
};
// Letras con tilde, diéresis, etc. (`&oacute;`, `&Ntilde;`): letra + diacrítico combinante.
const DIACRITICS = { acute: '́', grave: '̀', circ: '̂', tilde: '̃', uml: '̈' };

// Sin DOM (SSR, tests) se decodifican las entidades comunes y las numéricas.
const decodeEntities = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isNaN(n) ? match : String.fromCodePoint(n);
    }
    const accented = code.match(/^([a-z])(acute|grave|circ|tilde|uml)$/i);
    if (accented) return (accented[1] + DIACRITICS[accented[2]]).normalize('NFC');
    return ENTITIES[code] ?? match;
  });

const decodeCache = new Map();

/** Texto del menú con las entidades HTML decodificadas (el back manda `&oacute;` y similares). */
function decodeHTML(text) {
  if (text == null) return '';
  if (decodeCache.has(text)) return decodeCache.get(text);
  const result =
    typeof DOMParser === 'undefined'
      ? decodeEntities(String(text))
      : new DOMParser().parseFromString(text, 'text/html').documentElement.textContent;
  decodeCache.set(text, result);
  return result;
}

const currentHashPath = () => {
  if (typeof location === 'undefined') return '';
  const hash = location.hash;
  const queryIndex = hash.indexOf('?');
  return hash.slice(1, queryIndex === -1 ? undefined : queryIndex);
};

/**
 * Estado y acciones del menú, sin pedirlo ni compartirlo con los niveles anidados
 * (eso lo hace useHistrixMenu). Lo usa también el menú de sistema.
 */
export function createHistrixMenu({
  level,
  favorites: favoritesEnabled = false,
  tree: initialTree,
  onClose,
  onFavoritesChange
} = {}) {
  const api = useApi();
  const { navigate } = useHistrixNavigate();
  const { t } = useHistrixI18n();
  const notify = useHistrixNotify();
  const bus = useHistrixBus();
  const storage = useHistrixStorage();

  const tree = ref(initialTree || []);
  const featured = ref([]);
  const favorites = ref([]);
  const loading = ref(false);
  const featuredOpen = ref(storage.get('menu.featuredOpen') !== '0');
  const favoritesOpen = ref(storage.get('menu.favoritesOpen') !== '0');

  watch(featuredOpen, (val) => storage.set('menu.featuredOpen', val ? '1' : '0'));
  watch(favoritesOpen, (val) => storage.set('menu.favoritesOpen', val ? '1' : '0'));

  const favoritesOn = () => Boolean(toValue(favoritesEnabled));
  const isFavorite = (menuId) => favorites.value.some((fav) => fav.menuId === menuId);

  // `update-favorit` sale también por el bus (compat: las apps lo escuchan ahí).
  const notifyFavorites = () => {
    if (typeof onFavoritesChange === 'function') onFavoritesChange();
    bus.emit('update-favorit');
  };

  /** Agrega o quita un favorito. Acepta un nodo del árbol (`label`) o un favorito (`name`). */
  const toggleFavorite = async (item) => {
    const { menuId, uri } = item;
    if (isFavorite(menuId)) {
      try {
        await api.removeFavorit(menuId);
      } catch {
        notify.error(t('menu.favoriteError'));
        return;
      }
      favorites.value = favorites.value.filter((fav) => fav.menuId !== menuId);
      notifyFavorites();
      return;
    }
    const name = item.name ?? decodeHTML(item.label).toLowerCase();
    try {
      await api.setFavorit(menuId, uri, name);
      notify.success(t('menu.favoriteSaved'));
      favorites.value = [...favorites.value, { menuId, uri, name }];
      notifyFavorites();
    } catch {
      notify.error(t('menu.favoriteError'));
    }
  };

  // Última ruta elegida en el menú: si se vuelve a elegir la misma, se fuerza la recarga de la pantalla.
  let lastPath = '';
  const select = (to, { viaLink }) => {
    if (typeof onClose === 'function') onClose();
    if (lastPath && currentHashPath() === lastPath) {
      navigate({ ...to, hash: '#update' }, { replace: true });
      navigate({ ...to, hash: ' ', params: { a: 100 } }, { replace: true });
      return;
    }
    lastPath = to.path;
    if (!viaLink) navigate(to);
  };

  /** Navega al item y cierra el drawer. Para diseños que no usan `:to`. */
  const open = (node) => select(nodeUri(node), { viaLink: false });
  /** `@click` de un item con `:to="nodeUri(node)"`: cierra el drawer y recarga si es la ruta actual. */
  const onItemClick = (node) => select(nodeUri(node), { viaLink: true });

  // Un error en los favoritos no bloquea el menú (ni al revés): cada pedido se loguea por su lado.
  const reload = async () => {
    loading.value = true;
    const pending = [
      Promise.resolve()
        .then(() => api.getMenu(toValue(level)))
        .then((response) => {
          tree.value = response?.data?.tree || [];
          featured.value = response?.data?.featured || [];
        })
    ];
    if (favoritesOn()) {
      pending.push(
        Promise.resolve()
          .then(() => api.getFavorites())
          .then((response) => {
            favorites.value = response?.keys || [];
          })
      );
    }
    const results = await Promise.allSettled(pending);
    for (const result of results) if (result.status === 'rejected') console.error(result.reason);
    loading.value = false;
  };

  return {
    tree,
    featured,
    favorites,
    loading,
    featuredOpen,
    favoritesOpen,
    favoritesEnabled: favoritesOn,
    isFavorite,
    toggleFavorite,
    nodeUri,
    open,
    onItemClick,
    label: decodeHTML,
    reload
  };
}

/**
 * @param {object} [options]
 * @param {string | import('vue').Ref<string>} [options.level] nivel que se pide a `getMenu`.
 * @param {boolean | import('vue').Ref<boolean>} [options.favorites] habilita los favoritos del usuario.
 * @param {Array} [options.tree] árbol ya cargado: no se pide el menú (ni featured ni favoritos).
 * @param {() => void} [options.onClose] se llama al elegir un item (cerrar el drawer).
 * @param {() => void} [options.onFavoritesChange] se llama al agregar o quitar un favorito.
 */
export function useHistrixMenu(options = {}) {
  const menu = createHistrixMenu(options);
  if (getCurrentInstance()) provide(HISTRIX_MENU_KEY, menu);
  if (!options.tree) menu.reload();
  return menu;
}

/** Menú del nivel superior (lo usan los niveles anidados de HistrixExpansionMenu). */
export function injectHistrixMenu() {
  return getCurrentInstance() ? inject(HISTRIX_MENU_KEY, null) : null;
}

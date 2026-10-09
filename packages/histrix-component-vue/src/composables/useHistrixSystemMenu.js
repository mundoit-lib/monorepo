// Lógica del menú de sistema (el engranaje de Histrix), separada del diseño:
//
//   const system = useHistrixSystemMenu({ onClose: () => (open.value = false) });
//   system.enabled / system.entries / system.loading / system.load() / system.open(node)
//
// Se dibuja sólo si el `/me` trae `capabilities.systemMenu` (administradores) y el menú
// (`/menu/phpmen-fsm`) se pide recién entonces. HistrixSystemMenu se apoya en este composable;
// una app que quiere otro diseño usa sus slots o arma su propio componente con él.
import { computed, toValue, watch } from 'vue';
import { createHistrixMenu } from './useHistrixMenu.js';
import { useHistrixSession } from './useHistrixSession.js';

const SYSTEM_MENU_LEVEL = 'phpmen-fsm';

/** El árbol aplanado: cada rama es un encabezado (`header: true`) seguido de sus items. */
function flatten(nodes, depth = 0, out = []) {
  for (const node of nodes || []) {
    const branch = Array.isArray(node.children) && node.children.length > 0;
    out.push({ node, depth, header: branch });
    if (branch) flatten(node.children, depth + 1, out);
  }
  return out;
}

/**
 * @param {object} [options]
 * @param {boolean | import('vue').Ref<boolean> | (() => boolean)} [options.enabled] si se muestra;
 *   por defecto, `capabilities.systemMenu` del usuario de la sesión.
 * @param {boolean} [options.immediate] pide el menú apenas está habilitado (default `true`);
 *   con `false`, recién al llamar a `load()` (al abrir el engranaje).
 * @param {() => void} [options.onClose] se llama al elegir un item (cerrar el popup).
 */
export function useHistrixSystemMenu({ enabled, immediate = true, onClose } = {}) {
  const { user } = useHistrixSession();
  const isEnabled = computed(() =>
    enabled === undefined ? user.value?.capabilities?.systemMenu === true : Boolean(toValue(enabled))
  );
  const menu = createHistrixMenu({ level: SYSTEM_MENU_LEVEL, onClose });

  // Se pide una vez por usuario. Si vino vacío (o falló), se vuelve a pedir en el próximo load().
  let pending = null;
  const load = () => {
    if (!isEnabled.value) return Promise.resolve();
    pending ??= menu.reload().then(() => {
      if (!menu.tree.value.length) pending = null;
    });
    return pending;
  };
  const reload = () => {
    pending = null;
    return load();
  };

  // Al cambiar de usuario (o de permiso) se descarta el menú anterior.
  watch(
    () => isEnabled.value && (user.value?.id ?? user.value?.user_id ?? true),
    () => {
      pending = null;
      menu.tree.value = [];
      if (immediate) load();
    },
    { immediate: true }
  );

  return {
    enabled: isEnabled,
    tree: menu.tree,
    entries: computed(() => flatten(menu.tree.value)),
    loading: menu.loading,
    nodeUri: menu.nodeUri,
    open: menu.open,
    onItemClick: menu.onItemClick,
    label: menu.label,
    load,
    reload
  };
}

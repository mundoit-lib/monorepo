import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref, shallowRef } from 'vue';
import config from '../services/config.js';
import { createMemoryStorage } from '../services/storage.js';
import { useHistrixSystemMenu } from './useHistrixSystemMenu.js';

const api = vi.hoisted(() => ({ getMenu: vi.fn() }));
vi.mock('../services/histrixApi.js', () => ({ default: () => api }));

const session = vi.hoisted(() => ({ user: null }));
vi.mock('./useHistrixSession.js', () => ({ useHistrixSession: () => ({ user: session.user }) }));

// Forma real de /menu/phpmen-fsm (tork), recortada.
const tree = [
  { menuId: 617, label: 'MENUS DEL SISTEMA', uri: '/app/histrix/menu/menues.xml' },
  {
    menuId: 700,
    label: 'Configuraci&oacute;n',
    children: [{ menuId: 701, label: 'IMPRESORAS', uri: '/app/histrix/printers/htxprinters.xml' }]
  }
];

const admin = { id: 1, capabilities: { systemMenu: true, editor: true } };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let navigations;

beforeEach(() => {
  session.user = shallowRef(admin);
  navigations = [];
  config.storage = createMemoryStorage();
  config.onNavigate = (to, options) => navigations.push({ to, options });
  api.getMenu.mockResolvedValue({ data: { tree } });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  config.storage = undefined;
  config.onNavigate = undefined;
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('useHistrixSystemMenu', () => {
  it('con capabilities.systemMenu pide phpmen-fsm y aplana las ramas como encabezados', async () => {
    const system = useHistrixSystemMenu();
    expect(system.enabled.value).toBe(true);
    await flush();
    expect(api.getMenu).toHaveBeenCalledWith('phpmen-fsm');
    expect(system.tree.value).toEqual(tree);
    expect(system.entries.value.map(({ node, depth, header }) => [node.menuId, depth, header])).toEqual([
      [617, 0, false],
      [700, 0, true],
      [701, 1, false]
    ]);
    expect(system.label(tree[1].label)).toBe('Configuración');
  });

  it('sin capabilities.systemMenu no se muestra ni pide el menú', async () => {
    session.user = shallowRef({ id: 2, capabilities: { systemMenu: false, editor: false } });
    const system = useHistrixSystemMenu();
    await system.load();
    expect(system.enabled.value).toBe(false);
    expect(api.getMenu).not.toHaveBeenCalled();

    session.user = shallowRef({ id: 3 }); // backend viejo: sin capabilities
    expect(useHistrixSystemMenu().enabled.value).toBe(false);
  });

  it('con immediate: false lo pide recién en load(), una sola vez', async () => {
    const system = useHistrixSystemMenu({ immediate: false });
    await flush();
    expect(api.getMenu).not.toHaveBeenCalled();
    await system.load();
    await system.load();
    expect(api.getMenu).toHaveBeenCalledTimes(1);
    await system.reload();
    expect(api.getMenu).toHaveBeenCalledTimes(2);
  });

  it('si falla o viene vacío, el próximo load() lo vuelve a pedir', async () => {
    api.getMenu.mockRejectedValueOnce(new Error('500'));
    const system = useHistrixSystemMenu({ immediate: false });
    await system.load();
    expect(system.tree.value).toEqual([]);
    expect(system.loading.value).toBe(false);
    await system.load();
    expect(api.getMenu).toHaveBeenCalledTimes(2);
    expect(system.tree.value).toEqual(tree);
  });

  it('al cambiar de usuario descarta el menú y lo vuelve a pedir', async () => {
    const system = useHistrixSystemMenu();
    await flush();
    session.user.value = { id: 2, capabilities: { systemMenu: false } };
    await nextTick();
    expect(system.enabled.value).toBe(false);
    expect(system.tree.value).toEqual([]);

    session.user.value = { id: 3, capabilities: { systemMenu: true } };
    await nextTick();
    await flush();
    expect(api.getMenu).toHaveBeenCalledTimes(2);
    expect(system.tree.value).toEqual(tree);
  });

  it('la opción enabled pisa a capabilities', async () => {
    const enabled = ref(false);
    const system = useHistrixSystemMenu({ enabled });
    await flush();
    expect(system.enabled.value).toBe(false);
    expect(api.getMenu).not.toHaveBeenCalled();
    enabled.value = true;
    await nextTick();
    await flush();
    expect(api.getMenu).toHaveBeenCalledTimes(1);
  });

  it('open navega al item como cualquier ítem de menú y llama a onClose', async () => {
    const onClose = vi.fn();
    const system = useHistrixSystemMenu({ onClose });
    await flush();
    system.open(tree[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(navigations[0].to).toEqual({
      path: '/auth/app/histrix/menu/menues.xml',
      query: { _title: 'MENUS DEL SISTEMA' }
    });
  });
});

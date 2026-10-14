import { describe, expect, it } from 'vitest';
import {
  branchIds,
  buildTree,
  canHaveChildren,
  cellValue,
  countNodes,
  newChildValues,
  nodeKeys,
  nodeMatches,
  rowValues,
  treeCaptionFields,
  treeLabelField,
  treeRootValue
} from './tree.js';

// Recorte del schema de histrix/menu/menues.xml (MENU DEL SISTEMA).
const schema = {
  type: 'arbol',
  parentField: 'Id_menu',
  childField: 'hijo',
  fields: {
    menuId: { name: 'menuId', esClave: 'true', type: 'number', hidden: true, hidden_column: true, column_style: '' },
    orden: { name: 'orden', esClave: 'true', type: 'number', hidden: false, column_style: '' },
    Id_menu: { name: 'Id_menu', esClave: 'true', type: 'text', hidden: false, column_style: '' },
    titulo: { name: 'titulo', type: 'text', hidden: false, column_style: '' },
    hijo: { name: 'hijo', type: 'text', hidden: false, column_style: 'display:none;' },
    ejecuta: { name: 'ejecuta', type: 'text', hidden: false, column_style: 'display:none;' },
    _notif: { name: '_notif', type: 'text', hidden: false, local: true, column_style: '' },
    web_version: { name: 'web_version', type: 'checkbox', hidden: false, column_style: 'display:none;' }
  },
  values: { menuId: '', orden: '', Id_menu: 'phpmen', titulo: '', hijo: '', ejecuta: '', web_version: '1' }
};

// Fila como la devuelve el backend: celdas envueltas y `children` anidados.
const row = (id, orden, menu, titulo, hijo = '', children = []) => ({
  menuId: { _: String(id), style: 'display:none;' },
  orden: { _: String(orden) },
  Id_menu: { _: menu },
  titulo: { _: titulo, style: 'color:#444;font-weight:bold;' },
  hijo: { _: hijo },
  ejecuta: { _: hijo ? '' : `${titulo.toLowerCase()}.xml` },
  web_version: { value: 1, _: '<input type="checkbox">' },
  DT_RowClass: '',
  DT_RowAttr: { o: id, 'data-recid': id },
  children
});

describe('cellValue / rowValues', () => {
  it('desenvuelve `value` antes que `_` y deja pasar los planos', () => {
    expect(cellValue({ value: 0, _: '<input>' })).toBe(0);
    expect(cellValue({ _: 'phpmen' })).toBe('phpmen');
    expect(cellValue('x')).toBe('x');
    expect(cellValue(null)).toBe(null);
  });

  it('saca children y DT_* de los valores', () => {
    const values = rowValues(row(1, 1, 'phpmen', 'Admin', 'administracion', [row(2, 1, 'administracion', 'Hijo')]));
    expect(values).toEqual({
      menuId: '1',
      orden: '1',
      Id_menu: 'phpmen',
      titulo: 'Admin',
      hijo: 'administracion',
      ejecuta: '',
      web_version: 1
    });
  });
});

describe('campos del nodo', () => {
  it('el texto es el primer visible de texto no clave (titulo)', () => {
    expect(treeLabelField(schema)).toBe('titulo');
  });

  it('cae al childField si no hay candidatos', () => {
    expect(treeLabelField({ childField: 'hijo', fields: {} })).toBe('hijo');
  });

  it('el detalle son los visibles que no son texto, relación ni locales', () => {
    expect(treeCaptionFields(schema)).toEqual(['orden']);
  });

  it('la raíz sale de schema.values[parentField]', () => {
    expect(treeRootValue(schema)).toBe('phpmen');
    expect(treeRootValue({ parentField: 'x', values: {} })).toBe('');
  });
});

describe('buildTree', () => {
  const options = {
    parentField: 'Id_menu',
    childField: 'hijo',
    labelField: 'titulo',
    fields: schema.fields,
    rootValue: 'phpmen'
  };

  it('respeta las filas anidadas del backend, con ids por ruta', () => {
    const rows = [
      row(10, 1, 'phpmen', 'Administración', 'administracion', [
        row(11, 10, 'administracion', 'Tesorería', 'tesoreria', [row(12, 1, 'tesoreria', 'Cajas')]),
        row(13, 20, 'administracion', 'Bancos')
      ]),
      row(20, 2, 'phpmen', 'Salir')
    ];
    const nodes = buildTree(rows, options);
    expect(nodes.map((n) => n.id)).toEqual(['10', '20']);
    expect(nodes[0].children.map((n) => [n.id, n.label])).toEqual([
      ['10/11', 'Tesorería'],
      ['10/13', 'Bancos']
    ]);
    expect(nodes[0].children[0].children[0].id).toBe('10/11/12');
    expect(nodes[1].children).toEqual([]);
    expect(countNodes(nodes)).toBe(5);
    expect(branchIds(nodes)).toEqual(['10', '10/11']);
  });

  it('arma el árbol desde una lista plana', () => {
    const rows = [
      row(12, 1, 'tesoreria', 'Cajas'),
      row(11, 10, 'administracion', 'Tesorería', 'tesoreria'),
      row(10, 1, 'phpmen', 'Administración', 'administracion'),
      row(20, 2, 'phpmen', 'Salir')
    ].map(({ children: _children, ...rest }) => rest);
    const nodes = buildTree(rows, options);
    expect(nodes.map((n) => n.label)).toEqual(['Administración', 'Salir']);
    expect(nodes[0].children[0].children[0].id).toBe('10/11/12');
  });

  it('un submenú usado por dos padres tiene ids distintos en cada uno', () => {
    const rows = [row(1, 1, 'phpmen', 'A', 'comun'), row(2, 2, 'phpmen', 'B', 'comun'), row(3, 1, 'comun', 'C')];
    const nodes = buildTree(rows, options);
    expect(nodes.map((n) => n.children[0].id)).toEqual(['1/3', '2/3']);
  });

  it('corta los ciclos', () => {
    const rows = [row(1, 1, 'phpmen', 'A', 'a'), row(2, 1, 'a', 'B', 'b'), row(3, 1, 'b', 'C', 'a')];
    const nodes = buildTree(rows, options);
    expect(countNodes(nodes)).toBe(3);
    expect(nodes[0].children[0].children[0].children).toEqual([]);
  });

  it('sin raíz toma como raíz lo que no cuelga de nadie', () => {
    const rows = [row(1, 1, 'top', 'A', 'a'), row(2, 1, 'a', 'B')];
    expect(buildTree(rows, { ...options, rootValue: '' }).map((n) => n.label)).toEqual(['A']);
  });

  it('sin texto usa el childField como etiqueta', () => {
    const nodes = buildTree([row(1, 1, 'phpmen', '', 'vacio')], options);
    expect(nodes[0].label).toBe('vacio');
  });

  it('tolera datos vacíos', () => {
    expect(buildTree(undefined, options)).toEqual([]);
  });
});

describe('alta y borrado', () => {
  const [parent] = buildTree([row(10, 1, 'phpmen', 'Administración', 'administracion')], {
    parentField: 'Id_menu',
    childField: 'hijo',
    labelField: 'titulo',
    fields: schema.fields
  });

  it('el alta de un hijo cuelga del childField del padre', () => {
    expect(newChildValues(schema.values, schema, parent)).toMatchObject({
      Id_menu: 'administracion',
      web_version: '1'
    });
  });

  it('el alta en la raíz usa schema.values[parentField]', () => {
    expect(newChildValues({ Id_menu: 'otro' }, schema)).toEqual({ Id_menu: 'phpmen' });
  });

  it('sólo se cuelgan hijos de nodos con childField', () => {
    expect(canHaveChildren(parent, schema)).toBe(true);
    expect(canHaveChildren({ values: { hijo: '' } }, schema)).toBe(false);
  });

  it('las claves del DELETE son los valores planos de los campos clave', () => {
    expect(nodeKeys(parent, schema.fields)).toEqual({ menuId: '10', orden: '1', Id_menu: 'phpmen' });
  });
});

describe('nodeMatches', () => {
  const [node] = buildTree([row(11, 10, 'administracion', 'Tesorería', 'tesoreria')], {
    parentField: 'Id_menu',
    childField: 'hijo',
    labelField: 'titulo',
    fields: schema.fields
  });

  it('busca sin mayúsculas ni tildes, en el texto y en los valores', () => {
    expect(nodeMatches(node, 'TESORERIA')).toBe(true);
    expect(nodeMatches(node, 'tesoreria.xml')).toBe(false);
    expect(nodeMatches(node, 'administ')).toBe(true);
    expect(nodeMatches(node, 'bancos')).toBe(false);
  });

  it('no busca en el campo padre (los hijos no coinciden por su Id_menu)', () => {
    expect(nodeMatches(node, 'administ', 'Id_menu')).toBe(false);
    expect(nodeMatches(node, 'tesoreria', 'Id_menu')).toBe(true);
  });

  it('una búsqueda vacía coincide con todo', () => {
    expect(nodeMatches(node, '  ')).toBe(true);
  });
});

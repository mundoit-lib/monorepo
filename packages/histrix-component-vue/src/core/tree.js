/**
 * @file Lógica pura de las pantallas `arbol` (HistrixTree).
 *
 * Un árbol de Histrix es una tabla autorreferenciada: cada fila cuelga del
 * nodo cuyo `childField` es igual a su `parentField` (en el menú del sistema,
 * `hijo` del padre = `Id_menu` del hijo). La raíz es el valor de
 * `schema.values[parentField]` (p. ej. `Id_menu = 'phpmen'`).
 *
 * El backend, filtrando por la raíz, ya devuelve las filas anidadas en
 * `children`; si llega una lista plana (sin `children`), el árbol se arma acá
 * con el mismo criterio. Las celdas llegan envueltas (`{ _: '…' }` o
 * `{ value: 1, _: '<input…>' }`): se desenvuelven con `cellValue`.
 */

import { keyFieldNames } from './keys.js';

/** Claves de la fila que no son campos del schema. */
const ROW_META = new Set(['children', 'DT_RowAttr', 'DT_RowClass', '_id']);

/**
 * Valor plano de una celda: `value` si viene (checkbox, combos), si no `_`.
 * @param {unknown} cell
 */
export function cellValue(cell) {
  if (cell && typeof cell === 'object') {
    return cell.value !== undefined ? cell.value : cell._;
  }
  return cell;
}

/**
 * Valores planos de una fila (lo que espera HistrixForm en `editedItem`), sin
 * `children` ni los atributos `DT_*`.
 * @param {Record<string, unknown>} row
 * @returns {Record<string, unknown>}
 */
export function rowValues(row) {
  const out = {};
  for (const key in row || {}) {
    if (ROW_META.has(key)) continue;
    out[key] = cellValue(row[key]);
  }
  return out;
}

const isShown = (field) =>
  field && !field.hidden && !field.hidden_column && !/display\s*:\s*none/.test(field.column_style || '');

/**
 * Campo que se muestra como texto del nodo: el primer campo visible de texto que
 * no es clave (en el menú, `titulo`); si no hay, el primer visible no clave; si
 * tampoco, el `childField`.
 * @param {import('../../types').HistrixSchema} schema
 * @returns {string|undefined}
 */
export function treeLabelField(schema) {
  const fields = Object.values(schema?.fields || {});
  const candidates = fields.filter((field) => isShown(field) && field.esClave !== 'true' && !field.local);
  const text = candidates.find((field) => field.type === 'text');
  return (text || candidates[0])?.name ?? schema?.childField;
}

/**
 * Campos que acompañan al texto del nodo: los visibles en la grilla que no son
 * el texto, ni la relación padre/hijo, ni locales (en el menú, `orden`).
 * @param {import('../../types').HistrixSchema} schema
 * @param {string} [labelField]
 * @returns {string[]}
 */
export function treeCaptionFields(schema, labelField = treeLabelField(schema)) {
  const skip = new Set([labelField, schema?.parentField, schema?.childField]);
  return Object.values(schema?.fields || {})
    .filter((field) => isShown(field) && !field.local && !skip.has(field.name))
    .map((field) => field.name);
}

/** Valor de la raíz del árbol: `schema.values[parentField]` (puede venir vacío). */
export function treeRootValue(schema) {
  const value = schema?.values?.[schema?.parentField];
  return value === undefined || value === null ? '' : String(value);
}

/** Id estable de una fila: `DT_RowAttr.o` (id del backend) o sus claves. */
function rowId(row, keyNames) {
  const id = row?.DT_RowAttr?.o ?? row?._id;
  if (id !== undefined && id !== null && id !== '') return String(id);
  return keyNames.map((name) => cellValue(row[name])).join('|');
}

/**
 * @typedef {object} TreeNode
 * @property {string} id      ruta de ids desde la raíz (`2361/1370`): única
 *                            aunque el mismo submenú cuelgue de dos padres.
 * @property {string} label
 * @property {Record<string, unknown>} values  valores planos de la fila.
 * @property {Record<string, unknown>} row     la fila tal cual llegó.
 * @property {TreeNode[]} children
 */

/**
 * Arma los nodos para `q-tree` a partir de las filas del backend.
 *
 * - Filas anidadas (`children`): se respeta la estructura y el orden.
 * - Lista plana: cada fila cuelga del primer nodo con `childField` igual a su
 *   `parentField`; son raíz las que tienen `parentField === rootValue` o cuyo
 *   padre no vino. Un ciclo (A llama a B y B a A) se corta.
 *
 * @param {Array<Record<string, unknown>>} rows
 * @param {object} options
 * @param {string} [options.parentField]
 * @param {string} [options.childField]
 * @param {string} [options.labelField]
 * @param {Record<string, any>} [options.fields]  schema.fields (para las claves).
 * @param {string} [options.rootValue]
 * @returns {TreeNode[]}
 */
export function buildTree(rows, { parentField, childField, labelField, fields, rootValue = '' } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const keyNames = keyFieldNames(fields);
  const label = (values) => {
    const text = labelField ? values[labelField] : undefined;
    return text === undefined || text === null || text === '' ? String(values[childField] ?? '') : String(text);
  };
  const toNode = (row, parentId, children) => {
    const values = rowValues(row);
    const id = parentId ? `${parentId}/${rowId(row, keyNames)}` : rowId(row, keyNames);
    return { id, label: label(values), values, row, children: children(id) };
  };

  if (list.some((row) => Array.isArray(row?.children) && row.children.length)) {
    const nest = (items, parentId) =>
      items.map((row) => toNode(row, parentId, (id) => nest(Array.isArray(row.children) ? row.children : [], id)));
    return nest(list, '');
  }

  // Lista plana: índice de hijos por valor de parentField.
  const byParent = new Map();
  for (const row of list) {
    const parent = String(cellValue(row[parentField]) ?? '');
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push(row);
  }
  const callers = new Set(list.map((row) => String(cellValue(row[childField]) ?? '')).filter(Boolean));
  const roots = list.filter((row) => {
    const parent = String(cellValue(row[parentField]) ?? '');
    return rootValue ? parent === rootValue : !callers.has(parent);
  });
  const attach = (items, parentId, seen) =>
    items.map((row) =>
      toNode(row, parentId, (id) => {
        const child = String(cellValue(row[childField]) ?? '');
        if (!child || seen.has(child)) return [];
        return attach(byParent.get(child) || [], id, new Set(seen).add(child));
      })
    );
  return attach(roots, '', new Set(rootValue ? [rootValue] : []));
}

/** Ids de todos los nodos con hijos (para "expandir todo"). */
export function branchIds(nodes) {
  const out = [];
  const walk = (items) => {
    for (const node of items || []) {
      if (node.children?.length) {
        out.push(node.id);
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return out;
}

const fold = (text) =>
  String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * ¿El nodo coincide con la búsqueda? Mira el texto y los valores de la fila
 * (en el menú, también `ejecuta` e `hijo`), sin distinguir mayúsculas ni
 * tildes. El `parentField` no cuenta: todos los hijos de "Tesorería" tienen
 * `Id_menu = gen_tesoreria` y aparecerían al buscar "tesoreria". q-tree muestra
 * además los ancestros de cada coincidencia.
 * @param {TreeNode} node
 * @param {string} search
 * @param {string} [parentField]
 */
export function nodeMatches(node, search, parentField) {
  const text = fold(search ?? '').trim();
  if (!text) return true;
  if (fold(node.label).includes(text)) return true;
  return Object.entries(node.values || {}).some(
    ([name, value]) => name !== parentField && value !== null && value !== undefined && fold(value).includes(text)
  );
}

/** Cantidad total de nodos del árbol. */
export function countNodes(nodes) {
  return (nodes || []).reduce((total, node) => total + 1 + countNodes(node.children), 0);
}

/**
 * Valores de un alta: los `defaults` del schema con el padre ya cargado
 * (`parentField` = `childField` del nodo padre, o la raíz si no hay padre).
 * @param {Record<string, unknown>} defaults  p. ej. newRecordValues(schema.values, query)
 * @param {import('../../types').HistrixSchema} schema
 * @param {TreeNode|null} [parent]
 */
export function newChildValues(defaults, schema, parent = null) {
  const out = { ...defaults };
  const { parentField, childField } = schema || {};
  if (!parentField) return out;
  out[parentField] = parent ? parent.values[childField] : treeRootValue(schema);
  return out;
}

/** ¿Se le pueden colgar hijos al nodo? Sólo si tiene `childField` cargado. */
export function canHaveChildren(node, schema) {
  const value = node?.values?.[schema?.childField];
  return value !== undefined && value !== null && value !== '';
}

/**
 * Claves primarias de un nodo para el DELETE, con los valores planos.
 * @param {TreeNode} node
 * @param {Record<string, any>} fields schema.fields
 */
export function nodeKeys(node, fields) {
  const keys = {};
  for (const name of keyFieldNames(fields)) {
    keys[name] = node.values[name];
  }
  return keys;
}

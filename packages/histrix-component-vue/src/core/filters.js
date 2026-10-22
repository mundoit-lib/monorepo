/**
 * Construcción de filtros pseudo-OData para el backend de Histrix.
 *
 * Contrato (docs/07 §4.4): por cada filtro activo se concatena el término
 * `&_f[]=campo&_o[]=operador&_v[]=valor` (incluido el `&` inicial de cada término).
 *
 * Semántica replicada fielmente desde el computed `filterString` de HistrixFilters.vue:
 *  - Si `type === 'checkbox'`, el valor emitido se normaliza a 1 (truthy) o 0 (falsy).
 *  - La inclusión del filtro se decide por la verdad del `valor` ORIGINAL (no del convertido):
 *    si `filter.valor` es falsy el filtro se omite.
 *    (Para un checkbox con `valor=false` esto implica que NO se incluye.)
 */

import { parseQueryString } from './export.js';

/**
 * @param {Array<{campo: string, operador: string, valor: *, type?: string}>} filters
 * @returns {string} querystring (vacío si no hay filtros activos)
 */
export function buildFilterQuery(filters) {
  let query = '';
  for (const filter of filters) {
    let value = filter.valor;
    if (filter.type === 'checkbox') {
      value = filter.valor ? 1 : 0;
    }
    if (filter.valor) {
      // El valor se codifica: un `&`, `+` o `%` tipeado en el filtro no debe partir el querystring.
      query += `&_f[]=${filter.campo}&_o[]=${filter.operador}&_v[]=${encodeURIComponent(value)}`;
    }
  }
  return query;
}

/**
 * Params del request de datos a partir de lo que emitió HistrixFilters (querystring
 * `&_f[]=…`). Antes de HD-7752 el querystring se pegaba a la URL; ahora viaja como
 * `params` de axios, que serializa `{ _f: ['a'] }` como `_f[]=a`. Si todavía no se
 * filtró, `fullQuery` es el objeto `query` de la pantalla (ya incluido aparte): `{}`.
 * @param {string|Object|undefined} fullQuery
 * @returns {Object<string, string[]>}
 */
export function filterQueryParams(fullQuery) {
  return typeof fullQuery === 'string' ? parseQueryString(fullQuery) : {};
}

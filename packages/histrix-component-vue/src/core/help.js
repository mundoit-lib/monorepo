/**
 * help.js — query de la request de datos de una ayuda (`__help`).
 */
import { compactValues, omit, pick, queryValues } from './values.js';

/**
 * Arma los params de la búsqueda de una ayuda.
 *
 *  - Valores del form: sólo los `context_fields` que pide el backend y que
 *    tengan valor. Schema viejo sin `context_fields`: todos los no vacíos menos
 *    el propio campo de la ayuda (ya viaja en `__help`).
 *  - Query del contenedor: la ayuda consulta el mismo xml con `__help`, así que
 *    lleva su query. P. ej. `reqo_grid.xml?id_oto=31` (la OTO llega por
 *    "histrix actualiza" con `parentField`): sin `id_oto` la ayuda lista
 *    artículos de todas las OTO.
 *  - Query del campo (`fieldQuerys[campo]`): sus valores escalares; pisa a lo
 *    anterior por ser lo más específico.
 *  - `params` (`__help`, etc.) y `term` van al final: nada los pisa.
 *  Las entradas objeto (queries anidadas) y los vacíos no se mandan.
 *
 * @param {Object} opts
 * @param {Object} opts.helpContainer
 * @param {Object<string, any>} [opts.formValues] - valores planos del form.
 * @param {Object<string, any>} [opts.containerQuery] - query del contenedor.
 * @param {Object<string, any>} [opts.fieldQuery] - query del campo.
 * @param {Object<string, any>} [opts.params] - params de la fuente de datos.
 * @param {string|number} [opts.term] - texto buscado.
 * @returns {Object<string, any>}
 */
export function buildHelpQuery({
  helpContainer,
  formValues = {},
  containerQuery = {},
  fieldQuery = {},
  params = {},
  term = ''
}) {
  const help = helpContainer || {};
  const values = Array.isArray(help.context_fields)
    ? compactValues(pick(formValues, help.context_fields))
    : omit(compactValues(formValues), params.__help || help.help_field);
  return {
    ...values,
    ...compactValues(queryValues(containerQuery)),
    ...compactValues(queryValues(fieldQuery)),
    ...params,
    term: term ?? ''
  };
}

/**
 * Params de página para la request de una ayuda: `offset`/`limit` de la página
 * que muestra la tabla (q-table, `page` desde 1). Con `rowsPerPage` 0 ("Todas")
 * pide el total si ya se conoce; si no, no limita (el backend usa su default).
 *
 * @param {{ page?: number, rowsPerPage?: number, rowsNumber?: number }} pagination
 * @returns {{ offset: number, limit: number } | {}}
 */
export function helpPageParams({ page = 1, rowsPerPage = 0, rowsNumber } = {}) {
  if (rowsPerPage > 0) {
    return { offset: (Math.max(page, 1) - 1) * rowsPerPage, limit: rowsPerPage };
  }
  return rowsNumber > 0 ? { offset: 0, limit: rowsNumber } : {};
}

/**
 * Lee la respuesta de una ayuda. Si trae `pagination` (`{ limit, offset,
 * total, has_more, next }`) la ayuda está paginada en el backend y `total` es el
 * total de registros; si no, vino completa y el total son las filas recibidas.
 *
 * @param {Object} body - `response.data` de la request.
 * @returns {{ rows: Array<Object>, total: number, paged: boolean }}
 */
export function parseHelpPage(body) {
  const rows = Array.isArray(body?.data) ? body.data : [];
  const pagination = body?.pagination;
  if (pagination && typeof pagination === 'object') {
    const total = Number(pagination.total ?? body.recordsTotal ?? rows.length);
    return { rows, total: Number.isFinite(total) ? total : rows.length, paged: true };
  }
  return { rows, total: rows.length, paged: false };
}

/** Alto mínimo útil del popup de ayuda (buscador + algunas filas + paginación). */
const HELP_MIN_HEIGHT = 320;
const HELP_MARGIN = 12;

/**
 * Dónde abrir el popup de ayuda y con qué alto máximo, según el lugar del campo
 * en la pantalla. Quasar posiciona el q-menu con CSS anchor positioning y no
 * resta el espacio ocupado: con muchas filas por página se salía por abajo y la
 * paginación quedaba inalcanzable. Abre hacia abajo con el espacio que queda; si
 * abajo no entra lo mínimo y arriba hay más, abre hacia arriba.
 *
 * @param {{ top: number, bottom: number }} rect - getBoundingClientRect del campo.
 * @param {number} viewportHeight - window.innerHeight.
 * @returns {{ anchor: string, self: string, maxHeight: string }}
 */
export function helpMenuPlacement(rect, viewportHeight) {
  const below = viewportHeight - rect.bottom - HELP_MARGIN;
  const above = rect.top - HELP_MARGIN;
  if (below >= HELP_MIN_HEIGHT || below >= above) {
    return { anchor: 'bottom left', self: 'top left', maxHeight: `${Math.max(below, 0)}px` };
  }
  return { anchor: 'top left', self: 'bottom left', maxHeight: `${Math.max(above, 0)}px` };
}

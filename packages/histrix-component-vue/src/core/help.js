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

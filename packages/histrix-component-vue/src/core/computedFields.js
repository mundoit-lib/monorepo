/**
 * @file `computed_fields`: cálculos y validaciones por campo (Histrix).
 *
 * Cada field puede traer `computed_fields: { destino: fórmula }`. Según la
 * clave destino:
 *  - nombre de un campo → cálculo: el resultado se escribe en ese campo.
 *  - `__EVAL` → validación del propio campo: si da false el valor es incorrecto
 *    (no escribe nada).
 *  - `__REQUIRED` / `__VISIBLE` / `__ENABLED` → estado del propio campo (los
 *    aplica HistrixField, ver core/dataFormulas.js).
 *
 * En las fórmulas, un campo `Date` vale su número de día y `__HOY__` el de hoy
 * (ver `formulaGetter`).
 *
 * Ej. reqo_grid de Tork: `cantidad_detalle` calcula `cantidad_restante =
 * (cantidad_habilitada - cantidad_detalle).toFixed(2)` y `cantidad_restante`
 * valida `cantidad_restante >= 0`: no se puede pedir más de lo habilitado.
 */

import { dayNumber, todayDayNumber } from './dates.js';
import { evaluateFormula, evaluateValidation } from './formula.js';

/** ¿La clave es una directiva (`__EVAL`, `__REQUIRED`…) y no un campo? */
export const isDirective = (key) => typeof key === 'string' && key.startsWith('__');

/**
 * Envuelve el getValue de una fórmula con las reglas de fechas:
 *  - un campo `histrix_type: "Date"` vale su número de día (días desde
 *    01/01/1970, ver `dayNumber`; vacío → 0), así restar fechas da días y
 *    compararlas funciona;
 *  - `__HOY__` es el número de día de hoy.
 * Ej. reqo_grid: `urgente = ( fecha_requerida - __HOY__ ) < 2 ? 1 : 0`.
 *
 * @param {Object} fields - schema.fields.
 * @param {(name: string) => *} getValue
 * @param {number} [today] - número de día de hoy (para tests).
 * @returns {(name: string) => *}
 */
export function formulaGetter(fields, getValue, today = todayDayNumber()) {
  return (name) => {
    if (name === '__HOY__') return today;
    const value = getValue(name);
    if (fields?.[name]?.histrix_type === 'Date') {
      const raw = value && typeof value === 'object' ? (value.value ?? value._) : value;
      return dayNumber(raw);
    }
    return value;
  };
}

/**
 * Cálculos de todos los campos: `{ destino: fórmula }`, sin las directivas.
 *
 * @param {Object} fields - schema.fields.
 * @returns {Object<string, string>}
 */
export function computedCalcs(fields) {
  const calcs = {};
  for (const field of Object.values(fields || {})) {
    for (const [target, formula] of Object.entries(field?.computed_fields || {})) {
      if (!isDirective(target) && formula) {
        calcs[target] = formula;
      }
    }
  }
  return calcs;
}

/**
 * Directivas de estado de un campo (`__REQUIRED`/`__VISIBLE`/`__ENABLED`) en la
 * forma de `data-formulas`, para cuando el campo no trae `data-formulas`.
 *
 * @param {Object} field
 * @returns {Array<{formula: string, targetField: string}>}
 */
export function computedDirectives(field) {
  return Object.entries(field?.computed_fields || {})
    .filter(([target, formula]) => isDirective(target) && target !== '__EVAL' && formula)
    .map(([targetField, formula]) => ({ formula, targetField }));
}

/**
 * Campos cuyo valor cambió entre dos estados del form (los objetos se comparan
 * por contenido). Sin estado previo no hay cambios.
 *
 * @param {Object<string, *>} [prev]
 * @param {Object<string, *>} next
 * @returns {string[]}
 */
export function changedKeys(prev, next) {
  if (!prev) return [];
  const keys = new Set([...Object.keys(prev), ...Object.keys(next || {})]);
  return [...keys].filter((key) => {
    const a = prev[key];
    const b = next?.[key];
    if (a === b) return false;
    return !(a && b && typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b));
  });
}

/**
 * Corre los cálculos de los campos que cambiaron, encadenados: si un cálculo
 * escribe un campo, después corren los `computed_fields` de ese campo (como el
 * legacy, que dispara el cálculo en el change del campo). Así `fecha_requerida`
 * calcula `urgente` sólo cuando se toca la fecha, y no al tocar cualquier otro
 * campo con la fecha todavía vacía. Devuelve sólo lo que cambió.
 *
 * @param {Object} fields - schema.fields.
 * @param {Iterable<string>} changedFields - campos que cambió el usuario.
 * @param {(name: string) => *} getValue - valor actual de un campo.
 * @returns {Object<string, *>} `{ campo: nuevoValor }`.
 */
export function runCalcs(fields, changedFields, getValue) {
  const changes = {};
  const current = (name) => (name in changes ? changes[name] : getValue(name));
  const read = formulaGetter(fields, current);
  const queue = [...changedFields];
  // Tope por si las fórmulas forman un ciclo.
  for (let steps = 0; queue.length && steps < 1000; steps++) {
    const source = queue.shift();
    for (const [target, formula] of Object.entries(fields?.[source]?.computed_fields || {})) {
      if (isDirective(target) || !formula) continue;
      const result = evaluateFormula(formula, read);
      if (result !== undefined && result !== current(target)) {
        changes[target] = result;
        queue.push(target);
      }
    }
  }
  return changes;
}

/**
 * Validaciones `__EVAL` que no se cumplen.
 *
 * El error va en el campo que valida y también en los campos cuyo cálculo lo
 * escribe: `cantidad_restante` suele estar oculto en el form y el que lo
 * corrige el usuario es `cantidad_detalle`. Si lo escriben varios campos (las
 * tres fechas de `fechas_validas`), van con `true`: en rojo, sin repetir el
 * mensaje en cada uno (queda en la barra del form).
 *
 * @param {Object} fields - schema.fields.
 * @param {(name: string) => *} getValue - valores (ya con los cálculos aplicados).
 * @param {string} defaultMessage - p. ej. "Valor incorrecto".
 * @returns {Object<string, string|true>} `{ campo: mensaje | true }` (vacío si todo valida).
 */
export function evalErrors(fields, getValue, defaultMessage) {
  const errors = {};
  const read = formulaGetter(fields, getValue);
  const entries = Object.entries(fields || {});
  for (const [key, field] of entries) {
    const formula = field?.computed_fields?.__EVAL;
    if (!formula || evaluateValidation(formula, read)) {
      continue;
    }
    const name = field.name || key;
    const message = field.errorMessage || defaultMessage;
    errors[name] = message;
    const writers = entries
      .filter(([, writer]) => writer?.computed_fields && name in writer.computed_fields)
      .map(([writerKey, writer]) => writer.name || writerKey);
    for (const writer of writers) {
      errors[writer] ??= writers.length === 1 ? message : true;
    }
  }
  return errors;
}

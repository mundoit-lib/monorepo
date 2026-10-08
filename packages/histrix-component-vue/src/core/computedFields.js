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
 * Ej. reqo_grid de Tork: `cantidad_detalle` calcula `cantidad_restante =
 * (cantidad_habilitada - cantidad_detalle).toFixed(2)` y `cantidad_restante`
 * valida `cantidad_restante >= 0`: no se puede pedir más de lo habilitado.
 */

import { evaluateFormula, evaluateValidation } from './formula.js';

/** ¿La clave es una directiva (`__EVAL`, `__REQUIRED`…) y no un campo? */
export const isDirective = (key) => typeof key === 'string' && key.startsWith('__');

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
 * Aplica los cálculos encadenados: un campo escrito por un cálculo puede ser
 * operando de otro, así que se repite hasta que nada cambie (con tope, por si
 * hay un ciclo). Devuelve sólo lo que cambió.
 *
 * @param {Object<string, string>} calcs - de `computedCalcs`.
 * @param {(name: string) => *} getValue - valor actual de un campo.
 * @returns {Object<string, *>} `{ campo: nuevoValor }`.
 */
export function runCalcs(calcs, getValue) {
  const changes = {};
  const read = (name) => (name in changes ? changes[name] : getValue(name));
  const targets = Object.keys(calcs || {});
  for (let pass = 0; pass <= targets.length; pass++) {
    let changed = false;
    for (const target of targets) {
      const result = evaluateFormula(calcs[target], read);
      if (result !== undefined && result !== read(target)) {
        changes[target] = result;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return changes;
}

/**
 * Validaciones `__EVAL` que no se cumplen.
 *
 * El error va en el campo que valida y también en los campos cuyo cálculo lo
 * escribe: `cantidad_restante` suele estar oculto en el form y el que lo
 * corrige el usuario es `cantidad_detalle`.
 *
 * @param {Object} fields - schema.fields.
 * @param {(name: string) => *} getValue - valores (ya con los cálculos aplicados).
 * @param {string} defaultMessage - p. ej. "Valor incorrecto".
 * @returns {Object<string, string>} `{ campo: mensaje }` (vacío si todo valida).
 */
export function evalErrors(fields, getValue, defaultMessage) {
  const errors = {};
  const entries = Object.entries(fields || {});
  for (const [key, field] of entries) {
    const formula = field?.computed_fields?.__EVAL;
    if (!formula || evaluateValidation(formula, getValue)) {
      continue;
    }
    const name = field.name || key;
    const message = field.errorMessage || defaultMessage;
    errors[name] = message;
    for (const [writerKey, writer] of entries) {
      if (writer?.computed_fields && name in writer.computed_fields) {
        errors[writer.name || writerKey] ??= message;
      }
    }
  }
  return errors;
}

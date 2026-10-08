import { describe, expect, it } from 'vitest';
import { computedCalcs, computedDirectives, evalErrors, isDirective, runCalcs } from './computedFields.js';

// Recorte de reqo_grid.xml (Tork).
const fields = {
  cantidad_detalle: {
    name: 'cantidad_detalle',
    computed_fields: { cantidad_restante: '(  cantidad_habilitada   -   cantidad_detalle  ) .toFixed(  2  ) ' }
  },
  cantidad_habilitada: { name: 'cantidad_habilitada', histrix_type: 'CustomNumeric' },
  fecha_inicio_reqo: {
    name: 'fecha_inicio_reqo',
    computed_fields: { __REQUIRED: 'tipo_requerimiento_id_reqo   ==   2' }
  },
  fecha_finalizacion_reqo: {
    name: 'fecha_finalizacion_reqo',
    computed_fields: { __REQUIRED: 'tipo_requerimiento_id_reqo   ==   3' }
  },
  cantidad_restante: { name: 'cantidad_restante', computed_fields: { __EVAL: 'cantidad_restante >= 0' } }
};

/** Aplica los cálculos y devuelve los valores finales. */
const withCalcs = (values) => ({ ...values, ...runCalcs(computedCalcs(fields), (k) => values[k]) });

describe('isDirective', () => {
  it('distingue directivas de campos', () => {
    expect(isDirective('__EVAL')).toBe(true);
    expect(isDirective('cantidad_restante')).toBe(false);
  });
});

describe('computedCalcs', () => {
  it('junta los cálculos de todos los campos sin las directivas', () => {
    expect(computedCalcs(fields)).toEqual({
      cantidad_restante: '(  cantidad_habilitada   -   cantidad_detalle  ) .toFixed(  2  ) '
    });
  });
});

describe('computedDirectives', () => {
  it('devuelve las directivas de estado con la forma de data-formulas', () => {
    expect(computedDirectives(fields.fecha_inicio_reqo)).toEqual([
      { formula: 'tipo_requerimiento_id_reqo   ==   2', targetField: '__REQUIRED' }
    ]);
    expect(computedDirectives(fields.cantidad_restante)).toEqual([]);
    expect(computedDirectives({})).toEqual([]);
  });
});

describe('runCalcs', () => {
  it('calcula con los valores crudos (vacío = 0, 1.234,50 = 1234.5)', () => {
    expect(withCalcs({ cantidad_habilitada: '10', cantidad_detalle: '12' }).cantidad_restante).toBe('-2.00');
    expect(withCalcs({ cantidad_habilitada: '1.234,50', cantidad_detalle: '1000' }).cantidad_restante).toBe('234.50');
    expect(withCalcs({ cantidad_habilitada: '', cantidad_detalle: '3' }).cantidad_restante).toBe('-3.00');
  });

  it('encadena: un campo calculado es operando del siguiente', () => {
    const calcs = { b: 'a * 2', c: 'b + 1' };
    expect(runCalcs(calcs, (k) => ({ a: 3, b: 0, c: 0 })[k])).toEqual({ b: 6, c: 7 });
  });

  it('no devuelve lo que no cambió y corta en un ciclo', () => {
    expect(runCalcs({ b: 'a * 2' }, (k) => ({ a: 3, b: 6 })[k])).toEqual({});
    expect(runCalcs({ a: 'b + 1', b: 'a + 1' }, (k) => ({ a: 0, b: 0 })[k])).toBeTypeOf('object');
  });
});

describe('evalErrors', () => {
  const errors = (values) => evalErrors(fields, (k) => withCalcs(values)[k], 'Valor incorrecto');

  it('pedir más de lo habilitado marca el campo que valida y el que lo calcula', () => {
    expect(errors({ cantidad_habilitada: '10', cantidad_detalle: '12' })).toEqual({
      cantidad_restante: 'Valor incorrecto',
      cantidad_detalle: 'Valor incorrecto'
    });
  });

  it('corregido a 8 valida', () => {
    expect(errors({ cantidad_habilitada: '10', cantidad_detalle: '8' })).toEqual({});
  });

  it('usa el errorMessage del schema si viene', () => {
    const custom = {
      ...fields,
      cantidad_restante: { ...fields.cantidad_restante, errorMessage: 'Supera lo habilitado' }
    };
    const values = withCalcs({ cantidad_habilitada: '1', cantidad_detalle: '2' });
    expect(evalErrors(custom, (k) => values[k], 'Valor incorrecto').cantidad_detalle).toBe('Supera lo habilitado');
  });

  it('una fórmula que no se puede evaluar no bloquea', () => {
    expect(evalErrors(fields, () => undefined, 'x')).toEqual({});
  });
});

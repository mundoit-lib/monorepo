import { describe, expect, it } from 'vitest';
import {
  changedKeys,
  computedCalcs,
  computedDirectives,
  evalErrors,
  formulaGetter,
  isDirective,
  runCalcs
} from './computedFields.js';

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

/** El usuario cambia `cantidad_detalle`: aplica los cálculos y devuelve los valores finales. */
const withCalcs = (values) => ({ ...values, ...runCalcs(fields, ['cantidad_detalle'], (k) => values[k]) });

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

  it('encadena: después de escribir un campo corren sus computed_fields', () => {
    const chain = { a: { computed_fields: { b: 'a * 2' } }, b: { computed_fields: { c: 'b + 1' } }, c: {} };
    expect(runCalcs(chain, ['a'], (k) => ({ a: 3, b: 0, c: 0 })[k])).toEqual({ b: 6, c: 7 });
  });

  it('sólo corren los cálculos de los campos que cambiaron', () => {
    const chain = { a: { computed_fields: { b: 'a * 2' } }, x: { computed_fields: { y: 'x + 1' } } };
    expect(runCalcs(chain, ['x'], (k) => ({ a: 3, x: 1 })[k])).toEqual({ y: 2 });
  });

  it('no devuelve lo que no cambió y corta en un ciclo', () => {
    const same = { a: { computed_fields: { b: 'a * 2' } } };
    expect(runCalcs(same, ['a'], (k) => ({ a: 3, b: 6 })[k])).toEqual({});
    const loop = { a: { computed_fields: { b: 'a + 1' } }, b: { computed_fields: { a: 'b + 1' } } };
    expect(runCalcs(loop, ['a'], (k) => ({ a: 0, b: 0 })[k])).toBeTypeOf('object');
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

// reqo_grid con fechas (Tork): urgente, fechas_validas y su __EVAL.
describe('fórmulas con fechas', () => {
  const VALIDAS =
    '( fecha_requerida == 0 || fecha_requerida >= __HOY__ ) && ( fecha_inicio_reqo == 0 || fecha_requerida <= fecha_inicio_reqo ) && ( fecha_inicio_reqo == 0 || fecha_finalizacion_reqo == 0 || fecha_inicio_reqo <= fecha_finalizacion_reqo ) ? 1 : 0';
  const dateFields = {
    fecha_requerida: {
      name: 'fecha_requerida',
      histrix_type: 'Date',
      computed_fields: { urgente: '( fecha_requerida - __HOY__ ) < 2 ? 1 : 0', fechas_validas: VALIDAS }
    },
    fecha_inicio_reqo: {
      name: 'fecha_inicio_reqo',
      histrix_type: 'Date',
      computed_fields: { fechas_validas: VALIDAS, __REQUIRED: 'tipo_requerimiento_id_reqo == 2' }
    },
    fecha_finalizacion_reqo: {
      name: 'fecha_finalizacion_reqo',
      histrix_type: 'Date',
      computed_fields: { fechas_validas: VALIDAS }
    },
    urgente: { name: 'urgente', histrix_type: 'Check' },
    fechas_validas: {
      name: 'fechas_validas',
      errorMessage: 'Fechas inválidas',
      computed_fields: { __EVAL: 'fechas_validas == 1' }
    }
  };
  const today = new Date();
  const iso = (offset) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const change = (changed, values) => {
    const base = {
      fecha_requerida: '',
      fecha_inicio_reqo: '',
      fecha_finalizacion_reqo: '',
      urgente: '',
      fechas_validas: 1,
      ...values
    };
    const out = { ...base, ...runCalcs(dateFields, changed, (k) => base[k]) };
    return { ...out, errors: evalErrors(dateFields, (k) => out[k], 'Valor incorrecto') };
  };

  it('formulaGetter: Date → número de día, vacío → 0, __HOY__', () => {
    const read = formulaGetter(dateFields, (k) => ({ fecha_requerida: '1970-01-03', fecha_inicio_reqo: '' })[k], 100);
    expect(read('fecha_requerida')).toBe(2);
    expect(read('fecha_inicio_reqo')).toBe(0);
    expect(read('__HOY__')).toBe(100);
  });

  it('urgente: 1 si la fecha requerida es hoy o mañana, 0 si es después', () => {
    expect(change(['fecha_requerida'], { fecha_requerida: iso(0) }).urgente).toBe(1);
    expect(change(['fecha_requerida'], { fecha_requerida: iso(1) }).urgente).toBe(1);
    expect(change(['fecha_requerida'], { fecha_requerida: iso(5) }).urgente).toBe(0);
  });

  it('con la fecha vacía, tocar otro campo no marca urgente', () => {
    expect(change(['fecha_finalizacion_reqo'], { fecha_finalizacion_reqo: iso(3) }).urgente).toBe('');
  });

  it('fecha requerida pasada o posterior al inicio → error en fechas_validas y en las fechas', () => {
    const pasada = change(['fecha_requerida'], { fecha_requerida: iso(-1) });
    expect(pasada.fechas_validas).toBe(0);
    // Las tres fechas lo escriben: en rojo, sin repetir el mensaje.
    expect(pasada.errors).toEqual({
      fechas_validas: 'Fechas inválidas',
      fecha_requerida: true,
      fecha_inicio_reqo: true,
      fecha_finalizacion_reqo: true
    });
    expect(change(['fecha_inicio_reqo'], { fecha_requerida: iso(5), fecha_inicio_reqo: iso(3) }).fechas_validas).toBe(
      0
    );
  });

  it('inicio después del fin es inválido; corregido vuelve a 1 sin errores', () => {
    expect(
      change(['fecha_finalizacion_reqo'], {
        fecha_requerida: iso(2),
        fecha_inicio_reqo: iso(4),
        fecha_finalizacion_reqo: iso(3)
      }).fechas_validas
    ).toBe(0);
    const ok = change(['fecha_finalizacion_reqo'], {
      fecha_requerida: iso(2),
      fecha_inicio_reqo: iso(4),
      fecha_finalizacion_reqo: iso(6),
      fechas_validas: 0
    });
    expect(ok.fechas_validas).toBe(1);
    expect(ok.errors).toEqual({});
  });
});

describe('changedKeys', () => {
  it('lista los campos que cambiaron (objetos por contenido)', () => {
    expect(changedKeys({ a: 1, b: { x: 1 }, c: 'z' }, { a: 2, b: { x: 1 }, c: 'z', d: 'nuevo' })).toEqual(['a', 'd']);
  });

  it('sin estado previo no hay cambios', () => {
    expect(changedKeys(undefined, { a: 1 })).toEqual([]);
  });
});

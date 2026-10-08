import { describe, expect, it } from 'vitest';
import { compactValues, newRecordValues, omit, pick, queryValues } from './values.js';

describe('compactValues', () => {
  it('elimina strings vacíos, null y undefined', () => {
    expect(compactValues({ a: '', b: null, c: undefined, d: 'x' })).toEqual({ d: 'x' });
  });

  it('conserva 0, "0" y false (son valores)', () => {
    expect(compactValues({ a: 0, b: '0', c: false, d: '' })).toEqual({ a: 0, b: '0', c: false });
  });

  it('conserva strings no vacíos y objetos', () => {
    const obj = { total: 'hola', nested: { x: 1 } };
    expect(compactValues(obj)).toEqual({ total: 'hola', nested: { x: 1 } });
  });

  it('replica el caso real del form (deja solo lo que tiene valor)', () => {
    const formValues = {
      titulo1: 'DATOS PRINCIPALES',
      id_oto: '',
      tipo_oto: '3',
      oto_numerador_format: '',
      regcuenta_resp_id: '',
      total_rqm_rao: '0',
      motivo_adicional: 'ok seba',
      id_req_obra: 1,
      cant_dias_habitado_oto: '30'
    };
    expect(compactValues(formValues)).toEqual({
      titulo1: 'DATOS PRINCIPALES',
      tipo_oto: '3',
      total_rqm_rao: '0',
      motivo_adicional: 'ok seba',
      id_req_obra: 1,
      cant_dias_habitado_oto: '30'
    });
  });

  it('devuelve {} para entradas inválidas', () => {
    expect(compactValues(null)).toEqual({});
    expect(compactValues(undefined)).toEqual({});
  });
});

describe('omit', () => {
  it('excluye la clave indicada', () => {
    expect(omit({ a: 1, b: 2, oto_numerador_format: '001' }, 'oto_numerador_format')).toEqual({ a: 1, b: 2 });
  });

  it('excluye varias claves', () => {
    expect(omit({ a: 1, b: 2, c: 3 }, 'a', 'c')).toEqual({ b: 2 });
  });

  it('ignora claves vacías/nulas y las inexistentes', () => {
    expect(omit({ a: 1 }, '', null, undefined, 'noexiste')).toEqual({ a: 1 });
  });

  it('devuelve {} para entradas inválidas', () => {
    expect(omit(null, 'a')).toEqual({});
    expect(omit(undefined, 'a')).toEqual({});
  });
});

describe('pick', () => {
  it('conserva sólo las claves indicadas', () => {
    expect(pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ a: 1, c: 3 });
  });

  it('ignora claves que no existen en el objeto', () => {
    expect(pick({ a: 1 }, ['a', 'noexiste'])).toEqual({ a: 1 });
  });

  it('conserva valores vacíos (el filtrado de vacíos lo hace compactValues)', () => {
    expect(pick({ tipo_oto: '', cant_dias_habitado_oto: '30' }, ['tipo_oto', 'cant_dias_habitado_oto'])).toEqual({
      tipo_oto: '',
      cant_dias_habitado_oto: '30'
    });
  });

  it('con lista vacía devuelve {}', () => {
    expect(pick({ a: 1 }, [])).toEqual({});
  });

  it('devuelve {} para entradas inválidas', () => {
    expect(pick(null, ['a'])).toEqual({});
    expect(pick({ a: 1 }, null)).toEqual({});
  });
});

describe('queryValues', () => {
  it('copia los valores escalares de la query', () => {
    expect(queryValues({ id_oto: 31, nombre: 'x', vacio: '', cero: 0 })).toEqual({
      id_oto: 31,
      nombre: 'x',
      vacio: '',
      cero: 0
    });
  });

  it('no copia las queries anidadas de un campo (caso reqo_grid de Tork)', () => {
    expect(queryValues({ codigo_detalle: { id_oto: 31 }, id_oto: 31 })).toEqual({ id_oto: 31 });
  });

  it('conserva arrays y tolera query vacía', () => {
    expect(queryValues({ ids: [1, 2] })).toEqual({ ids: [1, 2] });
    expect(queryValues(undefined)).toEqual({});
  });
});

describe('newRecordValues', () => {
  // reqo_grid de Tork: el schema se pide con codigo_detalle[id_oto]= y el
  // backend lo devuelve en schema.values.
  const values = { id_oto: '', _ORDEN: 1, codigo_detalle: { id_oto: '' }, cantidad_detalle: '' };
  const query = { codigo_detalle: { id_oto: 31 } };

  it('descarta los valores que son el eco de una query anidada', () => {
    expect(newRecordValues(values, query)).toEqual({ id_oto: '', _ORDEN: 1, cantidad_detalle: '' });
  });

  it('conserva un valor escalar aunque el campo tenga query anidada', () => {
    expect(newRecordValues({ codigo_detalle: 'A1' }, query)).toEqual({ codigo_detalle: 'A1' });
  });

  it('sin query devuelve una copia profunda', () => {
    const out = newRecordValues(values);
    expect(out).toEqual(values);
    expect(out.codigo_detalle).not.toBe(values.codigo_detalle);
    expect(newRecordValues(undefined, query)).toEqual({});
  });
});

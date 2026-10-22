import { describe, expect, it } from 'vitest';

import { buildFilterQuery, filterQueryParams } from './filters.js';

describe('buildFilterQuery', () => {
  it('arma un filtro simple', () => {
    expect(buildFilterQuery([{ campo: 'nombre', operador: 'like', valor: 'juan' }])).toBe(
      '&_f[]=nombre&_o[]=like&_v[]=juan'
    );
  });

  it('concatena varios filtros respetando el orden y el & inicial de cada término', () => {
    expect(
      buildFilterQuery([
        { campo: 'nombre', operador: 'like', valor: 'juan' },
        { campo: 'edad', operador: 'gt', valor: 18 }
      ])
    ).toBe('&_f[]=nombre&_o[]=like&_v[]=juan&_f[]=edad&_o[]=gt&_v[]=18');
  });

  it('convierte checkbox true a 1', () => {
    expect(buildFilterQuery([{ campo: 'activo', operador: 'eq', valor: true, type: 'checkbox' }])).toBe(
      '&_f[]=activo&_o[]=eq&_v[]=1'
    );
  });

  it('omite checkbox false (valor original falsy → no se incluye)', () => {
    expect(buildFilterQuery([{ campo: 'activo', operador: 'eq', valor: false, type: 'checkbox' }])).toBe('');
  });

  it('omite un filtro sin valor', () => {
    expect(
      buildFilterQuery([
        { campo: 'nombre', operador: 'like', valor: '' },
        { campo: 'edad', operador: 'gt', valor: 18 }
      ])
    ).toBe('&_f[]=edad&_o[]=gt&_v[]=18');
  });

  it('devuelve string vacío con array vacío', () => {
    expect(buildFilterQuery([])).toBe('');
  });

  it('codifica el valor para que un & no parta el querystring', () => {
    expect(buildFilterQuery([{ campo: 'nombre', operador: 'like', valor: 'A&B 50%' }])).toBe(
      '&_f[]=nombre&_o[]=like&_v[]=A%26B%2050%25'
    );
  });
});

describe('filterQueryParams', () => {
  it('convierte el querystring de los filtros en params para axios', () => {
    const query = buildFilterQuery([
      { campo: 'codigo', operador: 'like', valor: 'var' },
      { campo: 'estado', operador: '=', valor: 'A&B' }
    ]);
    expect(filterQueryParams(query)).toEqual({ _f: ['codigo', 'estado'], _o: ['like', '='], _v: ['var', 'A&B'] });
  });

  it('sin filtrar todavía (fullQuery es el objeto query) no agrega nada', () => {
    expect(filterQueryParams({ id_oto: '128' })).toEqual({});
    expect(filterQueryParams(undefined)).toEqual({});
  });
});

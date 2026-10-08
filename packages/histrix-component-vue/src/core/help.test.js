import { describe, expect, it } from 'vitest';
import { buildHelpQuery } from './help.js';

describe('buildHelpQuery', () => {
  // codigo_detalle de reqo_grid (Tork): context_fields vacío, la OTO llega por
  // la query del campo.
  const helpContainer = { help_field: 'codigo_detalle', context_fields: [] };
  const params = { __help: 'codigo_detalle' };

  it('manda la query del contenedor (reqo_grid.xml?id_oto=31)', () => {
    expect(
      buildHelpQuery({
        helpContainer,
        formValues: { id_oto: 31 },
        containerQuery: { id_oto: 31, _title: 'REMYS' },
        params,
        term: 'TUB'
      })
    ).toEqual({ id_oto: 31, _title: 'REMYS', __help: 'codigo_detalle', term: 'TUB' });
  });

  it('la query del campo pisa a la del contenedor', () => {
    expect(buildHelpQuery({ helpContainer, containerQuery: { id_oto: 1 }, fieldQuery: { id_oto: 2 }, params })).toEqual(
      {
        id_oto: 2,
        __help: 'codigo_detalle',
        term: ''
      }
    );
  });

  it('manda los valores escalares de la query del campo (filtro por OTO)', () => {
    expect(
      buildHelpQuery({
        helpContainer,
        formValues: { id_oto: '', cantidad_detalle: '3' },
        fieldQuery: { id_oto: 31 },
        params,
        term: 'TUB'
      })
    ).toEqual({ id_oto: 31, __help: 'codigo_detalle', term: 'TUB' });
  });

  it('no manda queries anidadas ni vacíos de la query del campo', () => {
    expect(buildHelpQuery({ helpContainer, fieldQuery: { otro: { id_oto: 31 }, vacio: '' }, params })).toEqual({
      __help: 'codigo_detalle',
      term: ''
    });
  });

  it('la query del campo pisa al form y no pisa __help ni term', () => {
    const query = buildHelpQuery({
      helpContainer: { help_field: 'codigo_detalle', context_fields: ['id_oto'] },
      formValues: { id_oto: 5 },
      fieldQuery: { id_oto: 31, __help: 'x', term: 'y' },
      params,
      term: 'TUB'
    });
    expect(query).toEqual({ id_oto: 31, __help: 'codigo_detalle', term: 'TUB' });
  });

  it('sin context_fields manda el form sin vacíos ni el propio campo', () => {
    expect(
      buildHelpQuery({
        helpContainer: { help_field: 'codigo_detalle' },
        formValues: { codigo_detalle: 'A', id_oto: 31, x: '' },
        params
      })
    ).toEqual({ id_oto: 31, __help: 'codigo_detalle', term: '' });
  });
});

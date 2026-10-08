import { describe, expect, it } from 'vitest';
import { buildHelpQuery, helpMenuPlacement, helpPageParams, parseHelpPage } from './help.js';

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

describe('helpPageParams', () => {
  it('pide sólo la página que muestra la tabla', () => {
    expect(helpPageParams({ page: 1, rowsPerPage: 8 })).toEqual({ offset: 0, limit: 8 });
    expect(helpPageParams({ page: 3, rowsPerPage: 10 })).toEqual({ offset: 20, limit: 10 });
  });

  it('"Todas" pide el total si se conoce; si no, no limita', () => {
    expect(helpPageParams({ page: 1, rowsPerPage: 0, rowsNumber: 2832 })).toEqual({ offset: 0, limit: 2832 });
    expect(helpPageParams({ page: 1, rowsPerPage: 0 })).toEqual({});
  });
});

describe('parseHelpPage', () => {
  it('con pagination (ayuda de artículos de Tork) el total es el del backend', () => {
    const body = {
      data: [{ id: 1 }, { id: 2 }],
      recordsTotal: 2832,
      pagination: { limit: 8, offset: 0, count: 8, has_more: true, total: 2832, total_pages: 354 }
    };
    expect(parseHelpPage(body)).toEqual({ rows: body.data, total: 2832, paged: true });
  });

  it('sin pagination vino completa', () => {
    expect(parseHelpPage({ data: [{ id: 1 }] })).toEqual({ rows: [{ id: 1 }], total: 1, paged: false });
    expect(parseHelpPage(undefined)).toEqual({ rows: [], total: 0, paged: false });
  });
});

describe('helpMenuPlacement', () => {
  it('abre hacia abajo con el espacio que queda (campo a media pantalla)', () => {
    expect(helpMenuPlacement({ top: 358, bottom: 398 }, 900)).toEqual({
      anchor: 'bottom left',
      self: 'top left',
      maxHeight: '490px'
    });
  });

  it('cerca del borde de abajo abre hacia arriba', () => {
    expect(helpMenuPlacement({ top: 760, bottom: 800 }, 900)).toEqual({
      anchor: 'top left',
      self: 'bottom left',
      maxHeight: '748px'
    });
  });
});

import { describe, expect, it } from 'vitest';
import { menuNodeRoute } from './menuRoute.js';

describe('menuNodeRoute', () => {
  it('un xml va a /auth con el título', () => {
    expect(menuNodeRoute({ uri: 'ventas/fac.xml', label: 'Fac' })).toEqual({
      path: '/auth/ventas/fac.xml',
      query: { _title: 'Fac' }
    });
  });

  it('los parámetros del uri pasan al query', () => {
    expect(
      menuNodeRoute({ uri: '/app/clientes/man/cuentas_file_cons.xml?subsistema_id=02&x=a%20b', label: 'Cliente ABM' })
    ).toEqual({
      path: '/auth/app/clientes/man/cuentas_file_cons.xml',
      query: { subsistema_id: '02', x: 'a b', _title: 'Cliente ABM' }
    });
  });

  it('un vue= va a esa ruta de la app', () => {
    expect(menuNodeRoute({ uri: '?vue=panel%2Fvista&a=1', label: 'Panel' })).toEqual({ path: '/panel/vista' });
  });

  it('sin uri no rompe', () => {
    expect(menuNodeRoute({ label: 'Nada' })).toEqual({ path: '/auth/', query: { _title: 'Nada' } });
  });
});

import { describe, expect, it } from 'vitest';
import { resolveIssuer, tenantFromIssuer } from './issuer';

describe('resolveIssuer', () => {
  it('con string devuelve la URL sin barra final', () => {
    expect(resolveIssuer('https://h/api/db/x///')).toBe('https://h/api/db/x');
  });

  it('con tenant usa la plantilla por defecto y limpia la barra del host', () => {
    expect(resolveIssuer({ host: 'https://h/', db: 'x' })).toBe('https://h/api/db/x');
  });

  it('acepta otra plantilla', () => {
    expect(resolveIssuer({ host: 'https://h', db: 'x' }, '{host}/oidc/{db}/')).toBe('https://h/oidc/x');
  });
});

describe('tenantFromIssuer', () => {
  it('es el inverso de resolveIssuer con la plantilla por defecto', () => {
    expect(tenantFromIssuer('https://h/api/db/x/')).toEqual({ host: 'https://h', db: 'x' });
    expect(tenantFromIssuer('https://h/api/db/x/mas/cosas')).toEqual({ host: 'https://h', db: 'x' });
  });

  it('sin /api/db/ devuelve el host con db vacía', () => {
    expect(tenantFromIssuer('https://h/')).toEqual({ host: 'https://h', db: '' });
  });
});

describe('resolveIssuer: valores raros', () => {
  it('codifica la db y no interpreta $ como patrón de replace', () => {
    expect(resolveIssuer({ host: 'https://h', db: 'a/b?c#d' })).toBe('https://h/api/db/a%2Fb%3Fc%23d');
    expect(resolveIssuer({ host: 'https://h', db: "x$'y" })).toBe("https://h/api/db/x%24'y");
    expect(resolveIssuer({ host: 'https://h$&', db: 'x' })).toBe('https://h$&/api/db/x');
    expect(tenantFromIssuer('https://h/api/db/a%2Fb')).toEqual({ host: 'https://h', db: 'a/b' });
  });
});

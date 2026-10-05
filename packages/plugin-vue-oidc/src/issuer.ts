/** Tenant de Histrix: a qué instancia y base habla la app. Es lo único que cambia entre clientes. */
export interface IssuerTenant {
  /** Origen del backend, p. ej. `https://cliente.histrix.com.ar` (con o sin barra final). */
  host: string;
  /** Base de datos del cliente. */
  db: string;
}

/** Un issuer OIDC: la URL directa o el tenant `{ host, db }` que la arma con `issuerTemplate`. */
export type OidcIssuer = string | IssuerTenant;

/** Plantilla por defecto: el issuer de Histrix vive bajo `/api/db/<db>`. */
export const DEFAULT_ISSUER_TEMPLATE = '{host}/api/db/{db}';

const trimSlash = (url: string): string => url.replace(/\/+$/, '');

/** URL del issuer sin barra final. Con un tenant, reemplaza `{host}` y `{db}` en la plantilla. */
export function resolveIssuer(issuer: OidcIssuer, template: string = DEFAULT_ISSUER_TEMPLATE): string {
  if (typeof issuer === 'string') return trimSlash(issuer);
  return trimSlash(template.replace('{host}', trimSlash(issuer.host)).replace('{db}', issuer.db));
}

/**
 * Inverso de `resolveIssuer` para links `#iss=...` con la plantilla por defecto.
 * Si la URL no tiene `/api/db/`, devuelve `{ host: url, db: '' }`.
 */
export function tenantFromIssuer(issuer: string): IssuerTenant {
  const url = trimSlash(issuer);
  const marker = '/api/db/';
  const index = url.indexOf(marker);
  if (index === -1) return { host: url, db: '' };
  return { host: url.slice(0, index), db: url.slice(index + marker.length).split('/')[0] ?? '' };
}

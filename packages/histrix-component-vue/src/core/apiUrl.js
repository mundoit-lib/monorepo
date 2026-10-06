// Cálculo de host y URL base de la API de Histrix, sin estado.
//
// `apiUrl` es la clave canónica de la config: puede ser el host pelado
// (`https://erp.ejemplo.com`) o la URL completa de una base
// (`https://erp.ejemplo.com/api/db/demo`); de ahí se deriva el host.
// `fixApi` es el nombre viejo del host: se sigue respetando (las apps actuales
// lo setean por FIX_API_URL) pero está deprecado.

const trimSlash = (value) => String(value || '').replace(/\/+$/, '');

/** Host a partir de una URL de API: corta desde `/api/` (o devuelve la URL tal cual). */
export function hostFromApiUrl(apiUrl) {
  const url = trimSlash(apiUrl);
  if (!url) return '';
  const index = url.indexOf('/api/');
  if (index !== -1) return url.slice(0, index);
  return url.endsWith('/api') ? url.slice(0, -4) : url;
}

/**
 * Host efectivo. Orden: `fixApi` (deprecado, compat) → derivado de `apiUrl` →
 * el guardado en el storage (selector de conexión), sólo si la config no trae host.
 * La config es la fuente viva (la app la cambia en runtime); el storage es el
 * fallback para las apps que no la setean.
 */
export function resolveHost({ storedHost, fixApi, apiUrl } = {}) {
  if (fixApi) return trimSlash(fixApi);
  const configured = hostFromApiUrl(apiUrl);
  if (configured) return configured;
  return trimSlash(storedHost);
}

/** URL base de la API de una base: `${host}/api/db/${db}`, o `apiUrl` si no hay base. */
export function buildApiUrl({ host, db, apiUrl } = {}) {
  if (db) return `${trimSlash(host)}/api/db/${db}`;
  return trimSlash(apiUrl);
}

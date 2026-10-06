/**
 * menuRoute.js — ruta de vue-router para un item del menú de Histrix.
 *
 * Un `.xml` va a `/auth/<uri>`; un `vue=<ruta>` va a esa ruta de la app. Los
 * parámetros que trae el `uri` (`?subsistema_id=02`) van al `query`: si quedan
 * en el `path`, vue-router los descarta al haber también un `query`.
 */
export function menuNodeRoute(node) {
  const uri = node?.uri || '';
  if (!uri.includes('vue=')) {
    const queryIndex = uri.indexOf('?');
    const file = queryIndex === -1 ? uri : uri.slice(0, queryIndex);
    const params = queryIndex === -1 ? {} : Object.fromEntries(new URLSearchParams(uri.slice(queryIndex + 1)));
    const path = `/auth/${file}`.replace('//', '/');
    return { path, query: { ...params, _title: node.label } };
  }
  const vue = uri.match(/vue=(.*?)(&|$)/)[1];
  const path = `/${vue}`.replace(/%2F/g, '/').replace('//', '/');
  return { path };
}

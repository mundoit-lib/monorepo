// Helpers puros de HistrixPdfViewer / HistrixApp (visor de PDF nativo del navegador).

/**
 * ¿El navegador muestra PDFs en línea (iframe)? `navigator.pdfViewerEnabled`
 * es false en Chrome Android y en algunas PWA de iOS. Si no existe (navegadores
 * viejos), se asume que sí, como hacía `q-pdfviewer type="html5"`.
 */
export function canShowPdfInline(nav = globalThis.navigator) {
  return nav?.pdfViewerEnabled !== false;
}

/** ¿Se puede compartir el archivo con la hoja nativa (Web Share API nivel 2)? */
export function canSharePdf(nav, file) {
  if (!file || typeof nav?.share !== 'function' || typeof nav?.canShare !== 'function') return false;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Nombre del archivo: el `filename` de `Content-Disposition` si viene
 * (`filename*=UTF-8''…` antes que `filename=`), si no `fallback`. Siempre termina en `.pdf`.
 */
export function pdfFilename(contentDisposition, fallback = 'documento') {
  let name = '';
  const header = String(contentDisposition || '');
  const extended = header.match(/filename\*\s*=\s*(?:UTF-8|utf-8)?''([^;]+)/);
  if (extended) {
    try {
      name = decodeURIComponent(extended[1].trim());
    } catch {
      name = extended[1].trim();
    }
  }
  if (!name) {
    const plain = header.match(/filename\s*=\s*("([^"]*)"|[^;]+)/);
    if (plain) name = (plain[2] ?? plain[1]).trim();
  }
  name = (name || String(fallback || '').trim() || 'documento').replace(/[\\/:*?"<>|]+/g, '-');
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}

/**
 * Dueño de un blob URL: `set(blob)` crea uno nuevo y revoca el anterior;
 * `revoke()` lo libera (al cerrar o desmontar).
 */
export function createBlobUrlHolder(urlApi = globalThis.URL) {
  let current = '';
  return {
    get url() {
      return current;
    },
    set(blob) {
      this.revoke();
      current = urlApi.createObjectURL(blob);
      return current;
    },
    revoke() {
      if (current) urlApi.revokeObjectURL(current);
      current = '';
    }
  };
}

import { describe, expect, it, vi } from 'vitest';
import { canSharePdf, canShowPdfInline, createBlobUrlHolder, pdfFilename, processPrints } from './pdf.js';

describe('canShowPdfInline', () => {
  it('false sólo si pdfViewerEnabled es false', () => {
    expect(canShowPdfInline({ pdfViewerEnabled: false })).toBe(false);
    expect(canShowPdfInline({ pdfViewerEnabled: true })).toBe(true);
    expect(canShowPdfInline({})).toBe(true);
    expect(canShowPdfInline(undefined)).toBe(true);
  });
});

describe('canSharePdf', () => {
  const file = { name: 'a.pdf' };

  it('pide share y canShare({ files })', () => {
    const canShare = vi.fn(() => true);
    expect(canSharePdf({ share() {}, canShare }, file)).toBe(true);
    expect(canShare).toHaveBeenCalledWith({ files: [file] });
  });

  it('false sin API, sin archivo, si canShare dice que no o si tira', () => {
    expect(canSharePdf({}, file)).toBe(false);
    expect(canSharePdf({ share() {} }, file)).toBe(false);
    expect(canSharePdf({ share() {}, canShare: () => true }, null)).toBe(false);
    expect(canSharePdf({ share() {}, canShare: () => false }, file)).toBe(false);
    const throws = () => {
      throw new TypeError('x');
    };
    expect(canSharePdf({ share() {}, canShare: throws }, file)).toBe(false);
  });
});

describe('pdfFilename', () => {
  it('toma filename de Content-Disposition', () => {
    expect(pdfFilename('attachment; filename="factura 12.pdf"')).toBe('factura 12.pdf');
    expect(pdfFilename('inline; filename=remito.pdf; size=3')).toBe('remito.pdf');
  });

  it('prefiere filename* (UTF-8)', () => {
    expect(pdfFilename('attachment; filename="x.pdf"; filename*=UTF-8\'\'recibo%20n%C2%BA1.pdf')).toBe(
      'recibo nº1.pdf'
    );
  });

  it('usa el fallback, agrega .pdf y limpia caracteres inválidos', () => {
    expect(pdfFilename('', 'Ventas: enero/2026')).toBe('Ventas- enero-2026.pdf');
    expect(pdfFilename(undefined, '')).toBe('documento.pdf');
    expect(pdfFilename('attachment; filename="listado"')).toBe('listado.pdf');
  });
});

describe('createBlobUrlHolder', () => {
  it('revoca el blob anterior al reemplazarlo y al liberar', () => {
    let n = 0;
    const urlApi = { createObjectURL: vi.fn(() => `blob:${++n}`), revokeObjectURL: vi.fn() };
    const holder = createBlobUrlHolder(urlApi);

    expect(holder.set({})).toBe('blob:1');
    expect(urlApi.revokeObjectURL).not.toHaveBeenCalled();

    expect(holder.set({})).toBe('blob:2');
    expect(urlApi.revokeObjectURL).toHaveBeenLastCalledWith('blob:1');

    holder.revoke();
    expect(urlApi.revokeObjectURL).toHaveBeenLastCalledWith('blob:2');
    expect(holder.url).toBe('');

    holder.revoke();
    expect(urlApi.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
});

describe('processPrints', () => {
  it('arma path y params desde xml, no desde la url', () => {
    const data = {
      debug: 'process succesfull',
      resourceIds: [],
      print: [
        {
          xml: 'qry/comprobante.xml',
          url: 'http://servidor.interno/api/db/demo/pdf/qry/comprobante.xml?id=1',
          params: { id: '1' },
          printer: '',
          copies: 1
        }
      ]
    };
    expect(processPrints(data)).toEqual([{ path: 'qry/comprobante.xml', params: { id: '1' } }]);
  });

  it('sin print, o con entradas sin xml, no hay nada que imprimir', () => {
    expect(processPrints(undefined)).toEqual([]);
    expect(processPrints({ resourceIds: [] })).toEqual([]);
    expect(processPrints({ print: [{ url: 'x' }, null] })).toEqual([]);
    expect(processPrints({ print: [{ xml: '/qry/comprobante.xml' }] })).toEqual([
      { path: 'qry/comprobante.xml', params: {} }
    ]);
  });
});

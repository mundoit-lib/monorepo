<template>
  <q-dialog v-if="!inline" :model-value="modelValue" maximized @update:model-value="setOpen">
    <q-card class="fit">
      <HistrixPdfViewer inline closable :src="src" :blob="blob" :filename="filename" @update:model-value="setOpen" />
    </q-card>
  </q-dialog>
  <div v-else-if="modelValue" class="histrix-pdf-viewer column no-wrap fit">
    <q-bar class="bg-primary text-white">
      <div class="ellipsis">{{ filename }}</div>
      <q-space />
      <q-btn dense flat round icon="download" :href="src || undefined" :download="filename" :disable="!src">
        <q-tooltip>{{ t('pdf.download') }}</q-tooltip>
      </q-btn>
      <q-btn dense flat round icon="open_in_new" :disable="!src" @click="openInNewTab">
        <q-tooltip>{{ t('pdf.open') }}</q-tooltip>
      </q-btn>
      <q-btn v-if="closable" dense flat round icon="close" @click="setOpen(false)">
        <q-tooltip>{{ t('common.close') }}</q-tooltip>
      </q-btn>
    </q-bar>
    <iframe v-if="showInline" class="col" :src="src || undefined" :title="filename" style="border: 0; width: 100%" />
    <div v-else class="col column flex-center q-gutter-md q-pa-lg text-center">
      <div class="text-body1">{{ t('pdf.notInline') }}</div>
      <q-btn v-if="shareFile" unelevated color="primary" icon="share" :label="t('pdf.share')" @click="share" />
      <q-btn outline color="primary" icon="open_in_new" :label="t('pdf.open')" :disable="!src" @click="openInNewTab" />
      <q-btn
        outline
        color="primary"
        icon="download"
        :label="t('pdf.download')"
        :href="src || undefined"
        :download="filename"
        :disable="!src"
      />
    </div>
  </div>
</template>

<script>
import { canSharePdf, canShowPdfInline } from '../core/pdf.js';
import { useHistrixI18n } from '../services/i18n.js';
import { useHistrixNotify } from '../services/notify.js';

/**
 * Visor de PDF con el visor nativo del navegador (reemplaza `q-pdfviewer`,
 * sin pdf.js ni `@quasar/qpdfviewer`).
 *
 *   <HistrixPdfViewer v-model="open" :src="blobUrl" :blob="blob" filename="factura.pdf" />
 *
 * En escritorio muestra el PDF en un iframe con Descargar y Abrir en pestaña nueva.
 * Si el navegador no muestra PDFs en línea (Chrome Android, iOS), muestra
 * Compartir (Web Share con el archivo), Abrir y Descargar. `inline` lo monta
 * en el lugar en vez de en un `q-dialog` maximizado. El blob URL es del que lo crea.
 */
export default {
  name: 'HistrixPdfViewer',
  props: {
    modelValue: { type: Boolean, default: true },
    // Blob URL (o URL del mismo origen) del PDF.
    src: { type: String, default: '' },
    // El PDF, para Compartir. Sin él, se lee de `src`.
    blob: { type: Blob, default: null },
    filename: { type: String, default: 'documento.pdf' },
    inline: { type: Boolean, default: false },
    closable: { type: Boolean, default: false }
  },
  emits: ['update:modelValue'],
  setup() {
    return { t: useHistrixI18n().t, notify: useHistrixNotify() };
  },
  data() {
    return {
      showInline: canShowPdfInline(),
      shareFile: null
    };
  },
  watch: {
    src: { handler: 'prepareShare', immediate: true },
    blob: 'prepareShare'
  },
  methods: {
    setOpen(value) {
      this.$emit('update:modelValue', value);
    },
    openInNewTab() {
      if (this.src) window.open(this.src, '_blank');
    },
    /** Arma el File para Compartir, sólo donde no hay visor en línea. */
    async prepareShare() {
      this.shareFile = null;
      if (!this.inline || this.showInline || !this.src || typeof File === 'undefined') return;
      const src = this.src;
      try {
        const blob = this.blob || (await (await fetch(src)).blob());
        const file = new File([blob], this.filename, { type: 'application/pdf' });
        if (src === this.src && canSharePdf(navigator, file)) this.shareFile = file;
      } catch {
        // Sin archivo no se ofrece Compartir; quedan Abrir y Descargar.
      }
    },
    async share() {
      try {
        await navigator.share({ files: [this.shareFile], title: this.filename });
      } catch (e) {
        if (e?.name !== 'AbortError') this.notify.error(`${this.t('pdf.shareError')}: ${e.message}`);
      }
    }
  }
};
</script>

<template>
  <div>
    <div class="fit" v-if="isPdf" style="position: absolute">
      <HistrixPdfViewer inline :src="pdfSrc" :blob="pdfBlob" :filename="pdfFilename" />
    </div>
    <HistrixPdfViewer v-model="showPdfPopup" :src="pdfSrc" :blob="pdfBlob" :filename="pdfFilename" />
    <!-- Sin schema todavía no hay qué montar: un spinner en lugar del blanco
         (p. ej. el detalle recién elegido en un maestro-detalle). -->
    <div v-if="schemaLoading && !schema.type" class="histrix-app__loading flex flex-center q-pa-xl">
      <q-spinner color="primary" size="40px" />
    </div>
    <template v-if="!isPdf">
      <q-splitter
        v-model="finalSplitterModel"
        ref="splitter"
        class="fit"
        :class="{ 'histrix-app--split': isSplitView, 'histrix-app--detail-full': isDetailFull }"
        :style="masterMinHeight ? { '--histrix-master-min-height': `${masterMinHeight}px` } : null"
        style="overflow: hidden"
        :limits="[0, Infinity]"
        :separator-class="this.smallscreen || !hasFullDetail ? 'hidden' : ''"
      >
        <template v-slot:before>
          <div class="histrix-app__master">
            <div v-if="!hasStepper">
              <component
                v-if="!hasStepper"
                ref="main"
                v-bind:is="histrixComponent"
                v-bind="$attrs"
                :path="path"
                :query="componentQuery"
                :resources="resources"
                :schema="schema"
                :finalStep="finalStep"
                :model-value="localValue"
                @update:model-value="
                  ($event) => {
                    localValue = $event;
                    $emit('update:modelValue', $event);
                  }
                "
                :inner="inner"
                :title="title"
                :url="xmlUrl"
                :styles="styles"
                :editedItem="schema.values"
                :computedFields="computedFields"
                :computedTotals="computedTotals"
                v-on:open-detail="openDetail"
                v-on:open-popup="showLinkDialog"
                v-on:closepopup="closePopup"
                v-on:computed-total="onComputedTotal"
                v-on:select-row="selectRow"
                v-on:export="showExportForm"
                v-on:print="togglePdf"
                v-on:validity="onValidityChange"
                v-on:advance-step="$emit('advance-step')"
                v-on:process-finish="refreshMaster"
              >
                <template v-slot:slot-top-form="props">
                  <slot name="slot-top-form" :props="props.props" />
                </template>
                <template v-slot:slot-top-field-histrixapp="props">
                  <slot name="slot-top-field-histrixapp" :props="props.props" />
                </template>
                <template v-slot:slot-botton-form="props">
                  <slot name="slot-botton-form" :props="props.props" />
                </template>
              </component>
              <div class="row justify-center">
                <div class="q-pa-sm">
                  <q-btn
                    icon="thumb_up"
                    :disable="processing"
                    :label="labelButton"
                    class="bg-secondary text-white nojustify-end"
                    @click="process"
                    v-if="schema.can_process && !inner && !isUnsupported"
                  />
                </div>
              </div>
            </div>
            <q-stepper v-if="hasStepper" v-model="step" keep-alive color="primary" animated>
              <q-step :name="1" :title="title || schema.title" icon="settings" :done="step > 1">
                <component
                  ref="main"
                  v-bind:is="histrixComponent"
                  v-bind="$attrs"
                  :path="path"
                  :query="componentQuery"
                  :resources="resources"
                  :schema="schema"
                  :model-value="localValue"
                  @update:model-value="
                    ($event) => {
                      localValue = $event;
                      $emit('update:modelValue', $event);
                    }
                  "
                  :inner="inner"
                  :title="title"
                  :url="xmlUrl"
                  :styles="styles"
                  :editedItem="schema.values"
                  :computedFields="computedFields"
                  :computedTotals="computedTotals"
                  v-on:open-detail="openDetail"
                  v-on:open-popup="showLinkDialog"
                  v-on:closepopup="closePopup"
                  v-on:computed-total="onComputedTotal"
                  v-on:select-row="selectRow"
                  v-on:export="showExportForm"
                  v-on:print="togglePdf"
                  v-on:validity="onValidityChange"
                  v-on:advance-step="step++"
                ></component>

                <q-stepper-navigation>
                  <q-btn @click="advanceStep" color="primary" :label="t('app.continue')" icon="navigate_next" />
                </q-stepper-navigation>
              </q-step>

              <q-step :name="2" :title="t('app.confirmation')" icon="done_all" :done="step > 2">
                <HistrixApp
                  ref="detail"
                  v-if="schema.process_next_step.xml != ''"
                  :path="schema.process_next_step.dir + '/' + schema.process_next_step.xml"
                  :query="processNextStepQuery"
                  :finalStep="true"
                  v-on:advance-step="finishStep"
                />
                <q-stepper-navigation>
                  <q-btn
                    flat
                    @click="step--"
                    color="primary"
                    :label="t('app.back')"
                    icon="navigate_before"
                    class="q-ml-sm"
                  />
                  <q-btn @click="finishStep" color="primary" :label="t('app.confirm')" icon="check" />
                </q-stepper-navigation>
              </q-step>
            </q-stepper>
          </div>
        </template>
        <template v-slot:after>
          <!-- La key rearma el detalle al elegir otra fila: detailQuery es un
               URLSearchParams y el xmlUrl del hijo no lo ve cambiar. -->
          <HistrixApp
            ref=""
            v-if="detailPath != ''"
            :key="detailKey"
            :path="detailPath"
            :query="detailQuery"
            v-on:process-finish="refreshMaster"
          />
          <div v-else-if="isSplitView" class="histrix-app__detail-empty column flex-center text-grey-6 q-pa-xl">
            <q-icon name="touch_app" size="48px" />
            <div class="q-mt-sm">{{ t('app.selectRow') }}</div>
          </div>
          <q-page-sticky position="bottom-right" :offset="[20, 10]">
            <q-btn
              icon="arrow_back"
              color="accent"
              fab
              @click="backFromDetail()"
              v-if="smallscreen && isDetailOpened"
            />
          </q-page-sticky>
        </template>
      </q-splitter>
    </template>

    <q-dialog
      v-model="showIframe"
      full-width
      :auto-close="false"
      transition-show="slide-down"
      transition-hide="slide-up"
    >
      <q-card>
        <iframe :src="iframe" width="100%" height="500px"> </iframe>
      </q-card>
    </q-dialog>
    <q-dialog
      v-model="linkDialog"
      full-width
      :maximized="$q.platform.is.mobile ? true : false"
      transition-show="slide-down"
      transition-hide="slide-up"
      @before-hide="closePopup"
    >
      <q-layout view="Lhh lpR fff" container class="bg-white">
        <q-header class="bg-primary">
          <q-toolbar>
            <q-toolbar-title>{{ innerQuery._title || this.dialogTitle }}</q-toolbar-title>
            <q-btn flat @click="linkDialog = false" round dense icon="close" />
          </q-toolbar>
        </q-header>
        <q-page-container>
          <q-page>
            <HistrixApp
              :path="innerPath"
              :query="innerQuery"
              :title="innerQuery._title"
              class="col"
              v-on:closepopup="closePopup"
            />
          </q-page>
        </q-page-container>
      </q-layout>
    </q-dialog>

    <q-dialog v-model="exportDialog" position="top">
      <ExportForm
        :schema="schema"
        :path="path"
        :query="query"
        :exportQuery="exportQuery"
        @close="exportDialog = false"
      />
    </q-dialog>
    <q-dialog v-model="dialog" position="top">
      <q-card style="auto">
        <q-card-section class="row items-center no-wrap">
          <div>
            <div class="text-weight-bold">{{ message }}</div>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>
  </div>
</template>

<script>
import { getCurrentInstance } from 'vue';

import useApi from '../services/histrixApi.js';
import { useHistrixNavigate } from '../services/navigation.js';
import { useHistrixNotify } from '../services/notify.js';
import { useHistrixStorage } from '../services/storage.js';

import { useHistrixKeys } from '../composables/useHistrixKeys.js';

import ExportForm from './ExportForm.vue';
import HistrixPdfViewer from './HistrixPdfViewer.vue';
import { createBlobUrlHolder, pdfFilename } from '../core/pdf.js';

import { defineLazyComponent } from '../services/asyncComponents.js';

import { resolveScreenKind } from '../core/screenType.js';
import { useHistrixI18n } from '../services/i18n.js';

// Render: kind de pantalla → componente Vue. Los kinds que no están acá
// (map, kanban, card…) o los tipos desconocidos muestran HistrixUnsupported.
const SCREEN_COMPONENTS = {
  form: defineLazyComponent(() => import('./HistrixForm.vue')),
  table: defineLazyComponent(() => import('./HistrixTable.vue')),
  chart: defineLazyComponent(() => import('./HistrixChart.vue')),
  tree: defineLazyComponent(() => import('./HistrixTree.vue')),
  calendar: defineLazyComponent(() => import('./HistrixCalendar.vue')),
  dashboard: defineLazyComponent(() => import('./HistrixDashboard.vue')),
  list: defineLazyComponent(() => import('./HistrixList.vue'))
};
const HistrixUnsupported = defineLazyComponent(() => import('./HistrixUnsupported.vue'));

export default {
  name: 'HistrixApp',
  setup(props) {
    const { currentDb, apiUrl, getAppPdf, getAppSchema } = useApi();
    const { navigate } = useHistrixNavigate(props);
    // Atajos de teclado (F9, Esc, F2, F4, Enter): ver core/hotkeys.js.
    const vm = getCurrentInstance().proxy;
    useHistrixKeys({
      el: () => vm.$el,
      enabled: () => vm.keyboardEnabled(),
      handle: (action, event) => vm.onHotkey(action, event)
    });
    return {
      t: useHistrixI18n().t,
      notify: useHistrixNotify(),
      storage: useHistrixStorage(),
      navigate,
      currentDb,
      apiUrl,
      getAppPdf,
      getAppSchema
    };
  },
  props: {
    path: String,
    query: Object,
    styles: String,
    title: String,
    inner: Boolean,
    pdf: {
      type: Boolean,
      default: false
    },
    modelValue: null,
    database: {
      type: String,
      required: false
    },
    api: {
      type: String,
      required: false
    },
    finalStep: Boolean,
    // Navegación propia (to, { replace, back }) para `schema.redirect`; sin
    // definir usa config.onNavigate o el router de la app.
    onNavigate: { type: Function, default: null },
    // Atajos de teclado y foco automático. false los apaga en esta app y en
    // todo lo que contiene (forms, apps embebidas o abiertas en popups).
    keyboard: {
      type: Boolean,
      default: true
    }
  },
  inject: {
    parentKeyboard: { from: 'histrixKeyboard', default: () => () => true }
  },
  provide() {
    return {
      histrixKeyboard: () => this.keyboardEnabled()
    };
  },
  components: {
    ExportForm,
    HistrixPdfViewer
  },
  mounted() {
    this.getSchema();
    this.detailQuery = {};
    this.detailPath = '';
    this.closeDetail();
    this.localValue = this.modelValue;
    window.addEventListener('resize', this.fitMaster);
    window.addEventListener('popstate', this.onPopState);
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.fitMaster);
    window.removeEventListener('popstate', this.onPopState);
    // Invalida la petición de PDF en curso y libera el blob URL.
    this.pdfRequest = (this.pdfRequest || 0) + 1;
    this.pdfUrls?.revoke();
  },
  watch: {
    /**
     * Al dividir la pantalla (llega el schema con detalle o se agranda la
     * ventana) la lista pasa a scrollear adentro: se estira hasta el fondo de
     * la ventana y deja a la vista la fila elegida, si la hay.
     */
    isSplitView(split) {
      if (!split) return;
      this.$nextTick(() => {
        this.fitMaster();
        this.scrollToSelected();
      });
    },
    /**
     * If Path or Query parameters changes then reload all and reset data
     */
    value: {
      handler(_newVal, _oldVal) {
        this.localValue = this.modelValue;
      }
    },
    xmlUrl: {
      handler(newVal, oldVal) {
        if (newVal !== oldVal) {
          this.getSchema();
          this.step = 1; // reset stepper
          this.detailQuery = {};
          this.detailPath = '';
        }
      }
    }
  },
  computed: {
    componentQuery() {
      return { ...this.$route.query, ...this.query };
    },
    labelButton() {
      if (this.schema?.processButton) return this.schema?.processButton;
      return this.t('app.process');
    },
    redirectPage() {
      if (!this.schema || !this.schema.redirect) return null;
      return this.schema.redirect;
    },
    user() {
      return this.storage.get('user');
    },
    hasStepper() {
      if (this.schema?.process_next_step) {
        if (this.schema.process_next_step.condition && this.localValue !== undefined) {
          const condition = this.schema.process_next_step.condition;
          return this.schema.process_next_step && this.localValue[condition];
        }
        return true;
      }
    },
    processNextStepQuery() {
      const data = {};
      const targets = this.schema.process_next_step.query;
      if (targets) {
        Object.keys(targets).map((key) => {
          if (this.localValue) {
            data[key] = this.localValue[targets[key]];
          }
        });
        return data;
      }
    },
    /**
     * full App Url
     */
    xmlUrl() {
      const url = `${this.path}?${this.queryString}`;
      return url.replace('//', '/');
    },
    /**
     * Query String: merge browser query string with query props
     */
    queryString() {
      const query = { ...this.$route.query, ...this.query };
      return Object.keys(query)
        .map((key) => {
          // do not send objects in params
          if (typeof query[key] !== 'object') {
            return `${key}=${query[key]}`;
          }
        })
        .join('&');
    },
    /**
     * map of computed field and formulas
     */
    computedFields() {
      const computedFields = {};
      if (this.schema.fields) {
        Object.entries(this.schema.fields).map((field) => {
          if (field[1].computed_fields) {
            Object.entries(field[1].computed_fields).map((formula) => {
              computedFields[formula[0]] = formula[1];
            });
          }
        });
      }
      return computedFields;
    },
    /**
     * map of computed totals source and targets
     * when a table computes totals where that values goes
     * ex:  field 1 column sum goes to field X
     */
    computedTotals() {
      const computedTotals = {};
      if (this.schema.fields) {
        Object.entries(this.schema.fields).map((field) => {
          if (field[1].computed_totals) {
            Object.entries(field[1].computed_totals).map((formula) => {
              computedTotals[formula[0]] = field[0];
            });
          }
        });
      }
      return computedTotals;
    },
    /**
     * Default splitter Model
     */
    finalSplitterModel() {
      if (this.isSplitView) return 30;
      if (this.isDetailOpened && this.hasFullDetail) return 0;
      return 99.9;
    },
    /**
     * Maestro y detalle lado a lado: el alto lo pone el detalle y la lista
     * scrollea adentro (ver .histrix-app--split). En pantalla grande se divide
     * desde el principio, con el detalle vacío hasta elegir una fila, para que
     * la lista no salte de ancho al abrirlo.
     */
    isSplitView() {
      return this.hasFullDetail && !this.smallscreen;
    },
    /** Pantalla chica con el detalle abierto: ocupa todo, la lista se oculta. */
    isDetailFull() {
      return this.smallscreen && this.isDetailOpened && this.hasFullDetail;
    },
    smallscreen() {
      return this.$q.screen.lt.md;
    },
    hasDetail() {
      return this.schema.detail;
    },
    /**
     * tru if detail is not inline
     */
    hasFullDetail() {
      return this.hasDetail && !this.schema.inline_detail;
    },
    //TODO: cambiar
    /**
     * database id
     */
    databaseId() {
      return this.database ? this.database : this.currentDb();
    },
    /**
     * url api endpoint
     */
    apiUrl() {
      return this.api ? this.api : this.apiUrl();
    },
    /**
     * select apropiate component to render
     */
    histrixComponent() {
      // La DECISIÓN (qué tipo de pantalla es) vive en el módulo puro
      // ../core/screenType.js. Acá sólo queda el RENDER: kind → componente Vue.
      // Mientras el schema no llegó (type vacío) no se monta nada.
      if (!this.schema.type) return null;
      return SCREEN_COMPONENTS[resolveScreenKind(this.schema.type)] || HistrixUnsupported;
    },
    isUnsupported() {
      return this.histrixComponent === HistrixUnsupported;
    },
    isPdf() {
      if (this.schema.pdf || this.pdf) {
        this.fetchPDF();
        return true;
      }
      return false;
    },
    /**
     * SSR vue APi endpoint
     */
    vueUrl() {
      return `${this.apiUrl}/vue/${this.path}`;
    }
  },
  emits: ['update:modelValue', 'advance-step', 'process-finish', 'select-row', 'computed-total', 'closepopup'],
  methods: {
    hashcode(s) {
      return Math.abs(
        s.split('').reduce((a, b) => {
          const result = (a << 5) - a + b.charCodeAt(0);
          return result & result;
        }, 0)
      );
    },
    refreshMaster(data) {
      this.processing = false;
      this.$emit('process-finish', data);
      if (this.redirectPage) {
        this.navigate(this.redirectPage);
      }
    },
    onValidityChange(validity) {
      this.validity = validity;
    },
    /**
     * this will process al containers within STEPS
     */
    finishStep() {
      this.notify.info(this.t('app.stepPending'));
    },
    /**
     * emit event to parent component selected Row
     */
    selectRow(row) {
      this.$emit('select-row', row);
    },
    /**
     * emit event to parent component computed Totals
     */
    onComputedTotal(data) {
      this.$emit('computed-total', data);
    },
    /**
     * Open detail with row Attributes
     */
    /**
     * Alto mínimo de la lista dividida: desde donde arranca el splitter hasta
     * el fondo de la ventana (con la página arriba de todo).
     */
    fitMaster() {
      const el = this.$refs.splitter?.$el;
      if (!this.isSplitView || !el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      this.masterMinHeight = Math.max(window.innerHeight - top, 300);
    },
    /**
     * Lleva la fila elegida a la vista dentro de la lista, sin mover la página.
     */
    scrollToSelected() {
      const master = this.$refs.splitter?.$el.querySelector(':scope > .q-splitter__before > .histrix-app__master');
      const row = master?.querySelector('.histrix-row--selected');
      if (!row) return;
      const offset = row.getBoundingClientRect().top - master.getBoundingClientRect().top;
      const visible = offset >= 0 && offset + row.offsetHeight <= master.clientHeight;
      if (!visible) master.scrollTop += offset - master.clientHeight / 3;
    },
    openDetail($rowAttr) {
      this.selected = $rowAttr;
      this.detailQuery = new URLSearchParams($rowAttr.detailquery);
      this.detailPath = $rowAttr.detailpath;
      this.detailKey = `${$rowAttr.detailpath}?${this.detailQuery}`;
      this.isDetailOpened = true;
      if (this.smallscreen && this.hasFullDetail) this.pushDetailHistory();
    },
    /**
     * Valida el contenedor hijo (form) antes de avanzar de paso en el stepper.
     * Si hay errores, validateAndFocus los muestra y enfoca el primero, y no
     * avanzamos. Si el hijo no es un form (no tiene validateAndFocus), avanza.
     */
    async advanceStep() {
      if (typeof this.$refs.main?.validateAndFocus === 'function') {
        const valid = await this.$refs.main.validateAndFocus();
        if (!valid) {
          return;
        }
      }
      this.step++;
    },
    async process() {
      // El botón Procesar ya no se deshabilita por validez: validamos al tocarlo
      // y, si falta algo, mostramos el error y movemos el foco sin procesar.
      if (this.processing) {
        return;
      }
      if (typeof this.$refs.main?.validateAndFocus === 'function') {
        const valid = await this.$refs.main.validateAndFocus();
        if (!valid) {
          return;
        }
      }
      this.processing = true;
      try {
        await this.$refs.main.processData();
      } finally {
        this.processing = false;
      }
    },
    closeDetail() {
      this.isDetailOpened = false;
      if (this.smallscreen) this.detailPath = '';
    },
    /**
     * En pantalla chica el detalle ocupa toda la pantalla, como otra página:
     * se agrega una entrada al historial (misma URL, sin pasar por el router
     * para no recargar la lista) y el atrás del navegador o el gesto lo
     * cierran. El token identifica la entrada de esta app, por si hay detalles
     * anidados.
     */
    pushDetailHistory() {
      if (this.historyToken) return;
      this.historyToken = `histrix-detail-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      this.listScrollY = window.scrollY;
      const state = window.history.state || {};
      const open = Array.isArray(state.histrixDetail) ? state.histrixDetail : [];
      window.history.pushState({ ...state, histrixDetail: [...open, this.historyToken] }, '');
      window.scrollTo(0, 0);
    },
    /**
     * Atrás del navegador: si la entrada de este detalle ya no está en el
     * historial, se cierra y la lista vuelve a donde estaba (después del
     * scroll que haga el router de la app).
     */
    onPopState() {
      if (!this.historyToken) return;
      const open = window.history.state?.histrixDetail;
      if (Array.isArray(open) && open.includes(this.historyToken)) return;
      this.historyToken = null;
      this.closeDetail();
      const y = this.listScrollY;
      this.$nextTick(() => requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y))));
    },
    /** Botón de volver del detalle: mismo camino que el atrás del navegador. */
    backFromDetail() {
      if (this.historyToken) window.history.back();
      else this.closeDetail();
    },

    togglePdf() {
      this.fetchPDF();
      this.showPdfPopup = true;
    },

    showExportForm(query) {
      this.exportQuery = query;
      this.exportDialog = true;
    },
    dirname(path) {
      return path.match(/.*\//);
    },
    /**
     * Ejecuta un atajo de teclado (lo llama useHistrixKeys). Devuelve true si
     * consumió la tecla. F9 y Esc suben a la app que nos embebe (p. ej. el
     * grid de renglones dentro de un comprobante) si ésta no los resuelve.
     */
    onHotkey(action, event) {
      if (action === 'close' && this.escapeBelongsToDialog(event)) {
        return false;
      }
      if (action === 'process' || action === 'close') {
        const handled = action === 'process' ? this.processOnHotkey() : this.closeOnEscape();
        if (handled) {
          return true;
        }
        const parentApp = this.embeddingApp();
        return parentApp ? parentApp.onHotkey(action, event) : false;
      }
      if (action === 'help' || action === 'clear') {
        // Los resuelve el campo / filtro que tiene el foco (HistrixField,
        // HistrixFilters): le avisamos con un evento DOM que burbujea y que
        // ellos cancelan si lo atendieron.
        const target = event.target;
        if (!target || typeof target.dispatchEvent !== 'function') {
          return false;
        }
        const notice = new CustomEvent(`histrix-${action}`, { bubbles: true, cancelable: true });
        target.dispatchEvent(notice);
        return notice.defaultPrevented;
      }
      if (action === 'nextField') {
        const main = this.$refs.main;
        return typeof main?.focusNextField === 'function' && main.focusNextField(event.target) === true;
      }
      return false;
    },
    keyboardEnabled() {
      return this.keyboard !== false && this.parentKeyboard() !== false;
    },
    processOnHotkey() {
      // Mismas condiciones que el botón Procesar.
      if (!this.schema.can_process || this.inner || this.isUnsupported || this.hasStepper) {
        return false;
      }
      this.process();
      return true;
    },
    /**
     * Esc: los diálogos abiertos los cierra QDialog solo. Acá sólo resolvemos
     * el caso de una app `inner` abierta en un popup: emitimos `closepopup`
     * para que quien la abrió refresque y la cierre.
     */
    closeOnEscape() {
      if (!this.inner || !this.$el?.closest?.('.q-dialog')) {
        return false;
      }
      if (this.embeddingApp()) {
        return false;
      }
      this.$emit('closepopup');
      return true;
    },
    /**
     * ¿Hay un diálogo abierto por esta app, o el foco está en un diálogo
     * abierto encima de ella (ayuda, alta rápida…)? Entonces Esc es de QDialog.
     */
    escapeBelongsToDialog(event) {
      if (this.linkDialog || this.exportDialog || this.dialog || this.showIframe || this.showPdfPopup) {
        return true;
      }
      const focusDialog = event.target?.closest?.('.q-dialog');
      return Boolean(focusDialog && !focusDialog.contains(this.$el));
    },
    /** HistrixApp ancestro cuyo DOM nos contiene (no una abierta en un diálogo). */
    embeddingApp() {
      let parent = this.$parent;
      while (parent && parent.$options?.name !== 'HistrixApp') {
        parent = parent.$parent;
      }
      return parent?.$el?.contains?.(this.$el) ? parent : null;
    },
    closePopup() {
      this.refreshMaster();
      this.linkDialog = false;
      this.$emit('closepopup');
    },
    getDialogTitle(data) {
      const title = [];
      const schema = this.schema;
      const _attrs = data.DT_RowAttr;
      Object.entries(data).map((value) => {
        const field = schema.fields[value[0]];
        if (value[1] !== '' && field && !field.hidden && field.histrix_type === 'Varchar') {
          const val = value[1].replace(/<[^>]*>?/gm, '');
          title.push(val);
        }
      });
      return title.join(' - ');
    },
    showLinkDialog(data) {
      if (data.url) {
        this.iframe = data.url;
        this.dialogTitle = `${data.title}`;
        this.showIframe = true;
        return;
      }

      const title = this.getDialogTitle(data.row);
      const link = data.link;
      let path = `${link.dir}/${link.file}`;

      if (link.dir == null) {
        path = `/${this.dirname(this.path)}/${link.file}`;
      }

      this.innerPath = path.replace('//', '/');
      const queryString = `{"${decodeURI(data.parameters.substring(1))
        .replace(/"/g, '\\"')
        .replace(/&/g, '","')
        .replace(/=/g, '":"')}"}`;
      this.innerQuery = JSON.parse(queryString);
      this.linkDialog = true;
      this.dialogTitle = `${data.title}: ${title}`;
    },
    /**
     * Pide el PDF y lo deja en un blob URL nuevo. El anterior se libera antes
     * de pedir, así el visor no muestra el PDF viejo mientras llega el nuevo.
     * Sólo cuenta la última petición: una respuesta vieja, o que llega
     * después de desmontar, se descarta (`pdfRequest` cambió).
     */
    fetchPDF() {
      const request = (this.pdfRequest = (this.pdfRequest || 0) + 1);
      this.pdfUrls ??= createBlobUrlHolder();
      this.pdfUrls.revoke();
      this.pdfSrc = '';
      this.pdfBlob = null;
      this.getAppPdf(this.path, this.query)
        .then((res) => {
          if (request !== this.pdfRequest) return;
          // Siempre PDF: con application/octet-stream el iframe lo descargaría en vez de mostrarlo.
          const blob = new Blob([res.data], { type: 'application/pdf' });
          this.pdfBlob = blob;
          this.pdfFilename = pdfFilename(res.headers?.['content-disposition'], this.title || this.schema.title);
          this.pdfSrc = this.pdfUrls.set(blob);
        })
        .catch((e) => {
          if (request !== this.pdfRequest) return;
          this.notify.error(`${this.t('app.pdfError')}: ${e.message}`);
        });
    },
    /**
     * compute Field column class
     */
    columnClasses(field) {
      let columnClass = '';
      if (field.sum === 'true') {
        columnClass += ' bg-light-green-12 text-black ';
      }
      if (field.esClave === 'true') {
        columnClass += ' text-red ';
      }
      return columnClass;
    },
    /**
     * get Schema from API
     */
    getSchema() {
      this.schemaLoading = true;
      this.getAppSchema(this.path, this.query)
        .then((response) => {
          this.resources = response.data.resources;
          this.schema = response.data.schema;
          if (this.schema.type && !SCREEN_COMPONENTS[resolveScreenKind(this.schema.type)]) {
            console.warn(`[HistrixApp] tipo de pantalla no soportado: "${this.schema.type}" (${this.path})`);
          }
          // biome-ignore lint/suspicious/noPrototypeBuiltins: <explanation>
          if (this.schema.hasOwnProperty('fields')) {
            this.buildColumns();
          }

          this.schema.api = this.apiUrl;
        })
        .catch((e) => {
          this.dialog = true;
          this.message = `${this.t('app.schemaError')}: ${e.message}`;
        })
        .finally(() => {
          this.schemaLoading = false;
        });
    },
    /**
     * build columns structure for q-tables
     */
    buildColumns() {
      const fields = this.schema.fields;

      const columns = [];
      columns.push({
        name: '_id',
        label: 'rowid',
        field: '_id',
        hidden: true,
        style: null,
        align: null,
        classes: null,
        sortable: false,
        sum: false
      });

      Object.entries(fields).map((fieldArray, _i) => {
        const field = fieldArray[1];
        columns.push({
          name: field.name,
          label: field.title,
          field: field.name,
          hidden: field.hidden_column,
          style: field.column_style,
          align: field.align,
          classes: this.columnClasses(field),
          sortable: field.sortable,
          sum: field.sum,
          headerClasses: 'bg-primary text-white'
        });
      }, this);
      this.schema.columns = columns;
    }
  },
  data() {
    return {
      masterMinHeight: null,
      historyToken: null,
      listScrollY: 0,
      schemaLoading: false,
      step: 1, // default initial Step
      validity: true,
      processing: false,
      showPdfPopup: false,
      pdfSrc: '',
      pdfBlob: null,
      pdfFilename: 'documento.pdf',
      message: null,
      dialog: false,
      exportQuery: null,
      exportDialog: false, // show export Dialog
      linkDialog: false, // show inner link Dialog
      iframe: null, //  iframe url
      showIframe: false, // show inner link Dialog
      dialogTitle: '',
      innerPath: '', //  inner link
      innerQuery: '', //  inner link
      resources: null,
      localValue: {},
      isDetailOpened: false,
      schema: {
        type: '',
        title: null,
        filters: [],
        fields: [],
        columns: [],
        values: {}
      },
      data: [],
      selected: null,
      detailQuery: '',
      detailPath: '',
      detailKey: ''
    };
  }
};
</script>
<style>
.q-splitter__before,
.q-splitter__after {
  overflow: inherit;
}

/* Maestro-detalle dividido: la lista sale del flujo (absolute) y no suma alto,
   así el alto de la fila lo pone el detalle; el panel de la lista se estira a
   ese alto y scrollea adentro. El min-height (hasta el fondo de la ventana,
   ver fitMaster) cubre un detalle cargando o corto.
   El height: auto pisa el 100% de Quasar, que con el splitter de alto
   automático no deja estirar el panel. Con `>` para no tocar los splitters
   anidados del detalle. */
.histrix-app--split.q-splitter--vertical > .q-splitter__before {
  position: relative;
  height: auto;
  align-self: stretch;
  min-height: var(--histrix-master-min-height, 50vh);
}

/* Detalle a pantalla completa en celular: la lista queda montada (conserva
   página y filtros) pero oculta, para que no estire la página. */
.histrix-app--detail-full > .q-splitter__before {
  display: none;
}

.histrix-app__detail-empty,
.histrix-app--split > .q-splitter__after > div > .histrix-app__loading {
  min-height: 50vh;
}

.histrix-app--split.q-splitter--vertical > .q-splitter__before > .histrix-app__master {
  position: absolute;
  inset: 0;
  overflow-y: auto;
}
</style>

<template>
  <q-card class="histrix-help" style="min-width: 460px; max-width: 92vw">
    <q-card-section class="q-pb-xs">
      <div class="text-subtitle2 q-mb-xs">{{ title }}</div>
      <q-input
        v-model="search"
        dense
        clearable
        outlined
        debounce="400"
        type="search"
        :placeholder="t('help.search')"
        @update:model-value="loadData"
      >
        <template v-slot:append>
          <q-icon name="search" />
        </template>
      </q-input>
    </q-card-section>
    <q-card-section class="q-pt-none">
      <q-table
        :rows="rows"
        :columns="columns"
        :loading="loading"
        row-key="__rowid"
        dense
        flat
        v-model:pagination="pagination"
        :rows-per-page-options="[5, 8, 10, 15, 20, 25, 50, 0]"
        :hide-bottom="total <= pagination.rowsPerPage && pagination.rowsPerPage > 0"
        @request="onRequest"
        @row-click="onRowClick"
      >
        <template v-slot:header="props">
          <q-tr :props="props">
            <q-th v-for="col in props.cols" :key="col.name" :props="props" class="bg-primary text-white">
              {{ col.label }}
            </q-th>
          </q-tr>
        </template>
        <template v-slot:no-data>
          <div class="full-width text-center text-grey q-pa-sm">
            {{ loading ? t('common.searching') : t('common.noResults') }}
          </div>
        </template>
      </q-table>
    </q-card-section>
  </q-card>
</template>

<script>
import { buildHelpQuery, helpPageParams, parseHelpPage } from '../core/help.js';
import { joinDirXml, parseHelpDetail, parseSchemaUri } from '../core/schemaUri.js';
import { omit } from '../core/values.js';
import useApi from '../services/histrixApi.js';
import { useHistrixI18n } from '../services/i18n.js';

/**
 * Popup de ayuda (picker) para un campo con `helpContainer`.
 *
 * Modelo nuevo (ayudas stateless en JSON), usando la forma ESTRUCTURADA del
 * helpContainer (con fallback a parsear los strings uri/dataUri):
 *  - COLUMNAS: OPTIONS (schema) de la ayuda (`xml` + `dir`).
 *  - DATOS: GET a `parent` (xml+dir) con `__help = help_field`, `term` (lo tipeado)
 *    y los `context_fields` del form que tengan valor.
 *
 * Al elegir una fila, el relleno del form sale de `DT_RowAttr.data-helpdetail`
 * (mapa exacto campo→valor que da el backend). Se emite en `select-row` con la
 * misma forma que consume HistrixField.selectRow.
 */
export default {
  name: 'HistrixHelp',
  props: {
    helpContainer: { type: Object, required: true },
    // Estado actual del form (localValues). Se manda completo en cada búsqueda.
    formValues: { type: Object, default: () => ({}) },
    // Query del campo (fieldQuerys[campo]): filtro que le pasa el contenedor,
    // p. ej. { id_oto: 31 }. Sus valores escalares viajan en la búsqueda.
    query: { type: Object, default: () => ({}) },
    // Query del contenedor que la ayuda consulta con `__help` (p. ej. la de
    // reqo_grid: { id_oto: 31 }).
    containerQuery: { type: Object, default: () => ({}) },
    label: { type: String, default: '' },
    // Término de búsqueda vivo: lo maneja el campo padre (typeahead). Cada cambio
    // recarga la lista (con debounce). El buscador interno del popup lo refleja.
    term: { type: [String, Number], default: '' }
  },
  emits: ['select-row'],
  setup() {
    const { getAppSchema, getAppData } = useApi();
    return { t: useHistrixI18n().t, getAppSchema, getAppData };
  },
  data() {
    return {
      search: '',
      columns: [],
      rows: [],
      loading: false,
      delayTimer: 0,
      total: 0,
      requestSeq: 0,
      // rowsNumber presente = la q-table pagina en el backend (offset/limit) y
      // emite @request; si la ayuda no viene paginada se borra y pagina sola.
      pagination: { page: 1, rowsPerPage: 8, rowsNumber: 0 }
    };
  },
  computed: {
    title() {
      return this.label ? this.t('help.selectField', { label: this.label }) : this.t('help.select');
    },
    columnsSource() {
      // Preferimos la forma estructurada (xml + dir de la ayuda) en vez de parsear
      // el string `uri`; caemos a parsear `uri` sólo si no viene estructurada.
      const help = this.helpContainer;
      if (help.xml) {
        return { path: joinDirXml(help.dir, help.xml), params: {} };
      }
      return parseSchemaUri(help.uri);
    },
    dataSource() {
      // Forma estructurada: path desde `parent` (xml+dir) y `__help` desde
      // `help_field`. Es más robusto que parsear el string `dataUri`. Fallback:
      // `dataUri`, y si tampoco está (ayuda no migrada) la propia ayuda (`uri`).
      const help = this.helpContainer;
      if (help.parent?.xml) {
        const params = {};
        if (help.help_field) {
          params.__help = help.help_field;
        }
        return { path: joinDirXml(help.parent.dir, help.parent.xml), params };
      }
      return parseSchemaUri(help.dataUri || help.uri);
    },
    /**
     * values del form desnormalizados a escalares (las celdas pueden venir como
     * { value } o { _ }); axios no serializa objetos como query params.
     */
    cleanFormValues() {
      return this.flatten(this.formValues);
    }
  },
  methods: {
    flatten(obj) {
      const out = {};
      for (const key in obj) {
        if (key === 'DT_RowAttr') {
          continue;
        }
        const value = obj[key];
        if (value !== null && typeof value === 'object') {
          out[key] = value.value !== undefined ? value.value : value._ !== undefined ? value._ : '';
        } else {
          out[key] = value;
        }
      }
      return out;
    },
    loadColumns() {
      const { path } = this.columnsSource;
      if (!path) {
        return;
      }
      this.getAppSchema(path)
        .then((response) => {
          const fields = response.data?.schema?.fields || {};
          const columns = [];
          for (const name in fields) {
            const field = fields[name];
            if (field.hidden_column) {
              continue;
            }
            columns.push({
              name,
              label: field.title || name,
              field: name,
              align: field.align || 'left',
              sortable: true
            });
          }
          this.columns = columns;
        })
        .catch(() => {
          // Sin columnas: la tabla queda vacía; no rompemos el popup.
        });
    },
    /** Cambio de página o de filas por página en la tabla (modo backend). */
    onRequest({ pagination }) {
      this.pagination = { ...this.pagination, page: pagination.page, rowsPerPage: pagination.rowsPerPage };
      this.fetchPage();
    },
    /** Búsqueda nueva (término o contexto): vuelve a la primera página. */
    loadData() {
      this.pagination = { ...this.pagination, page: 1 };
      this.fetchPage();
    },
    fetchPage() {
      const { path, params } = this.dataSource;
      if (!path) {
        return;
      }
      this.loading = true;
      const seq = ++this.requestSeq;
      const query = buildHelpQuery({
        helpContainer: this.helpContainer,
        formValues: this.cleanFormValues,
        containerQuery: this.containerQuery,
        fieldQuery: this.query,
        params,
        term: this.search
      });
      // La ayuda pagina en el backend (offset/limit): se pide sólo la página que
      // muestra la tabla, no los 200 registros por defecto.
      this.getAppData(path, { ...query, ...helpPageParams(this.pagination) })
        .then((response) => {
          // Una respuesta vieja (se siguió tipeando) no pisa a la nueva.
          if (seq !== this.requestSeq) return;
          const { rows: data, total, paged } = parseHelpPage(response.data);
          this.total = total;
          const { rowsNumber: _rowsNumber, ...rest } = this.pagination;
          this.pagination = paged ? { ...rest, rowsNumber: total } : rest;
          // Preservamos data-helpdetail: el backend indica ahí, por fila, EXACTAMENTE
          // qué campos del form rellenar (con su nombre destino). Lo usamos al elegir.
          this.rows = data.map((row, index) => ({
            ...this.flatten(row),
            __rowid: index,
            __helpdetail: row.DT_RowAttr?.['data-helpdetail'] ?? null
          }));
          this.loading = false;
          // Si hay exactamente un resultado lo autoseleccionamos: no tiene sentido
          // mostrar una lista de uno para que el usuario lo clickee.
          if (total === 1 && this.rows.length === 1) {
            this.pick(this.rows[0]);
          }
        })
        .catch(() => {
          if (seq !== this.requestSeq) return;
          this.rows = [];
          this.total = 0;
          this.loading = false;
        });
    },
    pick(row) {
      // Preferimos el mapa exacto que da el backend (data-helpdetail): campos a
      // rellenar con su nombre destino, sin ensuciar el form con columnas de más.
      // Fallback (sin data-helpdetail): las columnas de la fila, sin internos.
      const fill = row.__helpdetail ? parseHelpDetail(row.__helpdetail) : omit(row, '__rowid', '__helpdetail');
      this.$emit('select-row', { row: fill });
    },
    onRowClick(_evt, row) {
      this.pick(row);
    }
  },
  watch: {
    // El padre (campo) actualiza `term` a medida que se tipea: sincronizamos el
    // buscador interno y recargamos, con debounce para no pegar en cada tecla.
    term(newVal) {
      const next = newVal != null ? String(newVal) : '';
      if (next === this.search) {
        return;
      }
      this.search = next;
      clearTimeout(this.delayTimer);
      this.delayTimer = setTimeout(() => this.loadData(), 350);
    }
  },
  mounted() {
    this.search = this.term != null ? String(this.term) : '';
    this.loadColumns();
    this.loadData();
  }
};
</script>

<style>
/* Con muchas filas por página la ayuda se salía de la pantalla y la paginación
   quedaba inalcanzable. La card toma el alto que Quasar le da al q-menu (lo
   ajusta al espacio disponible) y sólo las filas scrollean, con el encabezado
   fijo: el buscador y la paginación quedan siempre a la vista. */
.histrix-help {
  display: flex;
  flex-direction: column;
  max-height: inherit;
}
.histrix-help > .q-card__section:last-child {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
.histrix-help .q-table__container {
  flex: 1 1 auto;
  min-height: 0;
}
.histrix-help .q-table__middle {
  flex: 1 1 auto;
  min-height: 0;
  max-height: 60vh;
}
.histrix-help thead tr th {
  position: sticky;
  top: 0;
  z-index: 1;
}
</style>

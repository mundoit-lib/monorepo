<template>
  <div class="histrix-tree">
    <div class="histrix-tree__toolbar row items-center no-wrap q-gutter-x-xs q-mb-sm">
      <q-input v-model="filter" class="col" dense outlined clearable debounce="200" :placeholder="t('tree.search')">
        <template #prepend>
          <q-icon name="search" />
        </template>
      </q-input>
      <q-btn
        flat
        round
        dense
        :icon="expanded.length ? 'unfold_less' : 'unfold_more'"
        :title="expanded.length ? t('tree.collapseAll') : t('tree.expandAll')"
        @click="toggleAll"
      />
      <!-- En celular, recargar/exportar/imprimir van a un menú con texto para dejarle lugar al buscador. -->
      <template v-if="$q.screen.gt.xs">
        <q-btn flat round dense icon="refresh" :title="t('tree.reload')" :loading="loading" @click="getData" />
        <q-btn
          v-if="schema.export"
          flat
          round
          dense
          icon="download"
          :title="t('common.export')"
          @click="$emit('export')"
        />
        <q-btn v-if="schema.print" flat round dense icon="print" :title="t('common.print')" @click="$emit('print')" />
      </template>
      <q-btn v-else flat round dense icon="more_vert" :title="t('tree.more')">
        <q-menu auto-close>
          <q-list dense style="min-width: 160px">
            <q-item clickable @click="getData">
              <q-item-section avatar><q-icon name="refresh" /></q-item-section>
              <q-item-section>{{ t('tree.reload') }}</q-item-section>
            </q-item>
            <q-item v-if="schema.export" clickable @click="$emit('export')">
              <q-item-section avatar><q-icon name="download" /></q-item-section>
              <q-item-section>{{ t('common.export') }}</q-item-section>
            </q-item>
            <q-item v-if="schema.print" clickable @click="$emit('print')">
              <q-item-section avatar><q-icon name="print" /></q-item-section>
              <q-item-section>{{ t('common.print') }}</q-item-section>
            </q-item>
          </q-list>
        </q-menu>
      </q-btn>
      <q-btn
        v-if="canInsert"
        unelevated
        dense
        no-caps
        color="primary"
        icon="add"
        class="q-px-sm"
        :label="$q.screen.gt.xs ? t('common.new') : undefined"
        :title="t('tree.addRoot')"
        @click="addItem(null)"
      />
    </div>

    <HistrixFilters v-if="schema.filters?.length" dense :schema="schema" @filter-data="applyFilters" />

    <q-linear-progress v-if="loading" indeterminate class="q-mb-xs" />

    <q-banner v-if="error" dense rounded class="bg-red-1 text-negative q-mb-sm">
      {{ error }}
      <template #action>
        <q-btn flat dense no-caps :label="t('tree.reload')" @click="getData" />
      </template>
    </q-banner>

    <q-tree
      v-else
      class="histrix-tree__tree"
      :nodes="nodes"
      node-key="id"
      label-key="label"
      children-key="children"
      v-model:expanded="expanded"
      v-model:selected="selected"
      :filter="filter || ''"
      :filter-method="filterNode"
      :no-nodes-label="loading ? t('common.loading') : t('common.noResults')"
      :no-results-label="t('common.noResults')"
      selected-color="primary"
      dense
    >
      <template #default-header="{ node, expanded: isOpen }">
        <div
          class="histrix-tree__node row items-center no-wrap full-width"
          @dblclick.stop="canUpdate && editItem(node)"
        >
          <q-icon
            :name="nodeIcon(node, isOpen)"
            :color="node.children.length ? 'amber-8' : 'grey-6'"
            size="20px"
            class="q-mr-sm"
          />
          <div class="col ellipsis">
            <span class="histrix-tree__label" :style="labelStyle(node)">{{ node.label }}</span>
            <span
              v-for="name in $q.screen.gt.xs ? captionFields : []"
              :key="name"
              class="histrix-tree__caption q-ml-sm"
            >
              {{ captionText(node, name) }}
            </span>
          </div>
          <q-badge v-if="node.children.length" outline color="grey-6" class="q-mx-xs" :label="node.children.length" />
          <div class="histrix-tree__actions row no-wrap" @click.stop>
            <q-btn
              v-if="canInsert && canHaveChildren(node)"
              flat
              round
              dense
              size="sm"
              icon="add"
              color="primary"
              :title="t('tree.addChild')"
              @click="addItem(node)"
            />
            <q-btn
              v-if="canUpdate"
              flat
              round
              dense
              size="sm"
              icon="edit"
              color="primary"
              :title="t('table.edit')"
              @click="editItem(node)"
            />
            <q-btn
              v-if="canDelete"
              flat
              round
              dense
              size="sm"
              icon="delete"
              color="negative"
              :title="t('table.delete')"
              @click="deleteItem(node)"
            />
          </div>
        </div>
      </template>
    </q-tree>

    <q-dialog v-model="edit" full-width @update:model-value="onDialogToggle">
      <q-card class="histrix-tree__form">
        <q-card-section v-if="formTitle" class="q-pb-none text-subtitle1 text-weight-medium">
          {{ formTitle }}
        </q-card-section>
        <HistrixForm
          :resources="resources"
          :schema="schema"
          :path="path"
          :query="query"
          :inner="inner"
          :edited-item="editedItem"
          :edited-index="editedIndex"
          :new-record="newRecord"
          @form-saved="formSaved"
          @closepopup="closeEdit"
          @cancel="closeEdit"
          @value-edit="editDirty = $event"
          @open-popup="$emit('open-popup', $event)"
        />
      </q-card>
    </q-dialog>
  </div>
</template>

<script>
import {
  branchIds,
  buildTree,
  canHaveChildren,
  newChildValues,
  nodeKeys,
  nodeMatches,
  treeCaptionFields,
  treeLabelField,
  treeRootValue
} from '../core/tree.js';
import { newRecordValues } from '../core/values.js';
import useApi from '../services/histrixApi.js';
import { useHistrixI18n } from '../services/i18n.js';
import { useHistrixNotify } from '../services/notify.js';
import HistrixFilters from './HistrixFilters.vue';
import HistrixForm from './HistrixForm.vue';

/**
 * Pantallas `arbol`: tabla autorreferenciada (`parentField` → `childField`)
 * mostrada como árbol, con alta (en la raíz o colgando de un nodo), edición y
 * borrado por HistrixForm. La lógica pura vive en ../core/tree.js.
 */
export default {
  name: 'HistrixTree',
  // HistrixApp le pasa props de otras pantallas (finalStep, computedFields,
  // editedItem…): no van al DOM ni al form.
  inheritAttrs: false,
  components: { HistrixFilters, HistrixForm },
  props: {
    inner: { type: Boolean, default: false },
    title: { type: String, default: '' },
    path: { type: String, default: '' },
    query: { type: Object, default: () => ({}) },
    schema: { type: Object, required: true },
    resources: { type: Object, default: () => ({}) }
  },
  emits: ['export', 'print', 'open-popup'],
  setup() {
    const { deleteAppData, getAppData } = useApi();
    return { t: useHistrixI18n().t, notify: useHistrixNotify(), deleteAppData, getAppData };
  },
  data() {
    return {
      rows: [],
      loading: false,
      error: null,
      filter: '',
      localFilters: {},
      expanded: [],
      selected: null,
      edit: false,
      editDirty: false,
      newRecord: false,
      editedItem: {},
      editedIndex: -1,
      editedParent: null
    };
  },
  computed: {
    labelField() {
      return treeLabelField(this.schema);
    },
    captionFields() {
      return treeCaptionFields(this.schema, this.labelField);
    },
    rootValue() {
      return treeRootValue(this.schema);
    },
    nodes() {
      return buildTree(this.rows, {
        parentField: this.schema.parentField,
        childField: this.schema.childField,
        labelField: this.labelField,
        fields: this.schema.fields,
        rootValue: this.rootValue
      });
    },
    requestParams() {
      const params = { ...this.query, ...this.localFilters };
      if (this.schema.parentField && this.rootValue) {
        params[this.schema.parentField] = this.rootValue;
      }
      return params;
    },
    canInsert() {
      return Object.hasOwn(this.resources || {}, 'POST') && this.schema.can_insert !== false && !this.schema.readonly;
    },
    canUpdate() {
      return Object.hasOwn(this.resources || {}, 'PUT') && this.schema.can_update !== false && !this.schema.readonly;
    },
    canDelete() {
      return Object.hasOwn(this.resources || {}, 'DELETE') && this.schema.can_delete !== false && !this.schema.readonly;
    },
    formTitle() {
      if (!this.newRecord) return this.editedItem?.[this.labelField] || '';
      return this.editedParent ? `${this.t('tree.addChild')}: ${this.editedParent.label}` : this.t('tree.addRoot');
    }
  },
  watch: {
    path() {
      this.expanded = [];
      this.getData();
    },
    requestParams: {
      handler(next, prev) {
        if (JSON.stringify(next) !== JSON.stringify(prev)) this.getData();
      },
      deep: true
    },
    filter(text) {
      // Al buscar se abre todo para que se vean las coincidencias anidadas.
      if (text) this.expandAll();
    }
  },
  mounted() {
    this.getData();
  },
  methods: {
    canHaveChildren(node) {
      return canHaveChildren(node, this.schema);
    },
    nodeIcon(node, isOpen) {
      if (node.children.length) return isOpen ? 'folder_open' : 'folder';
      return this.canHaveChildren(node) ? 'folder' : 'description';
    },
    labelStyle(node) {
      // Estilo de la celda del texto que manda el backend (negrita en submenús).
      const style = node.row?.[this.labelField]?.style;
      return style && !/display\s*:\s*none/.test(style) ? style : undefined;
    },
    captionText(node, name) {
      const value = node.values[name];
      if (value === undefined || value === null || value === '') return '';
      const title = this.schema.fields[name]?.title;
      return title ? `${title}: ${value}` : String(value);
    },
    filterNode(node, filter) {
      return nodeMatches(node, filter, this.schema.parentField);
    },
    /** Un solo botón: si hay algo abierto contrae todo, si no expande todo. */
    toggleAll() {
      if (this.expanded.length) this.collapseAll();
      else this.expandAll();
    },
    expandAll() {
      this.expanded = branchIds(this.nodes);
    },
    collapseAll() {
      this.expanded = [];
    },
    applyFilters(query) {
      this.localFilters = query && typeof query === 'object' ? query : {};
    },
    /** Lo llama HistrixApp después de un proceso (reload). */
    reloadData() {
      return this.getData();
    },
    async getData() {
      this.loading = true;
      this.error = null;
      try {
        const response = await this.getAppData(this.path, this.requestParams);
        this.rows = response?.data?.data ?? [];
        // Los ids son rutas estables: se conserva lo abierto que todavía exista.
        const ids = new Set(branchIds(this.nodes));
        this.expanded = this.expanded.filter((id) => ids.has(id));
      } catch (e) {
        console.error(e);
        this.error = this.t('common.loadError');
      } finally {
        this.loading = false;
      }
    },
    addItem(parent) {
      this.newRecord = true;
      this.editedIndex = -1;
      this.editedParent = parent;
      this.editedItem = newChildValues(newRecordValues(this.schema.values, this.query), this.schema, parent);
      this.openEdit();
    },
    editItem(node) {
      this.newRecord = false;
      this.editedIndex = node.id;
      this.editedParent = null;
      this.selected = node.id;
      this.editedItem = { ...node.values };
      this.openEdit();
    },
    openEdit() {
      this.editDirty = false;
      this.edit = true;
    },
    closeEdit() {
      this.editDirty = false;
      this.edit = false;
    },
    /** Cerrar con cambios sin grabar (Esc, click afuera) pide confirmación. */
    async onDialogToggle(open) {
      if (open || !this.editDirty) return;
      if (await this.notify.confirm(this.t('table.closeUnsaved'))) {
        this.closeEdit();
      } else {
        this.edit = true;
      }
    },
    async formSaved() {
      const parent = this.editedParent;
      this.closeEdit();
      // Después de un alta queda abierto el padre, para ver el nodo nuevo.
      if (parent && !this.expanded.includes(parent.id)) {
        this.expanded = [...this.expanded, parent.id];
      }
      await this.getData();
    },
    async deleteItem(node) {
      const message = node.children.length
        ? this.t('tree.confirmDeleteBranch', { label: node.label, count: node.children.length })
        : this.t('tree.confirmDelete', { label: node.label });
      if (!(await this.notify.confirm(message))) return;
      try {
        await this.deleteAppData(this.path, nodeKeys(node, this.schema.fields));
        if (this.selected === node.id) this.selected = null;
        await this.getData();
      } catch (e) {
        this.notify.error(e);
      }
    }
  }
};
</script>

<style>
.histrix-tree__node {
  min-height: 32px;
}
.histrix-tree__label {
  font-size: 14px;
}
.histrix-tree__caption {
  font-size: 12px;
  color: #9e9e9e;
}
/* Las acciones aparecen al pasar por el nodo; en pantallas táctiles siempre. */
.histrix-tree__actions {
  opacity: 0;
  transition: opacity 0.15s;
}
.histrix-tree .q-tree__node-header:hover .histrix-tree__actions,
.histrix-tree .q-tree__node--selected .histrix-tree__actions,
.histrix-tree__actions:focus-within {
  opacity: 1;
}
@media (hover: none) {
  .histrix-tree__actions {
    opacity: 1;
  }
}
.histrix-tree__form {
  max-width: 900px;
}
</style>

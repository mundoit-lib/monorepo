<template>
  <q-btn v-if="m.enabled" round flat dense class="histrix-system-menu" :aria-label="title">
    <slot name="button" :loading="m.loading" :open="isOpen">
      <q-icon :name="icon" />
    </slot>
    <q-tooltip v-if="!isOpen">{{ title }}</q-tooltip>

    <q-menu v-model="isOpen" anchor="bottom right" self="top right" @before-show="m.load()">
      <q-list dense class="histrix-system-menu-list">
        <slot name="header" :title="title">
          <q-item-label header class="histrix-system-menu-title">{{ title }}</q-item-label>
        </slot>

        <template v-if="m.loading">
          <slot name="loading">
            <q-item v-for="n in 4" :key="`sk-${n}`">
              <q-item-section>
                <q-skeleton type="text" />
              </q-item-section>
            </q-item>
          </slot>
        </template>

        <template v-else-if="!m.entries.length">
          <slot name="empty">
            <q-item>
              <q-item-section class="text-grey-7">{{ t('systemMenu.empty') }}</q-item-section>
            </q-item>
          </slot>
        </template>

        <template
          v-for="entry in m.loading ? [] : m.entries"
          :key="entry.node.menuId || entry.node.key || entry.node.uri"
        >
          <slot
            v-if="entry.header"
            name="section"
            :node="entry.node"
            :label="m.label(entry.node.label)"
            :depth="entry.depth"
          >
            <q-item-label header class="histrix-system-menu-section" :style="indent(entry.depth)">
              {{ m.label(entry.node.label) }}
            </q-item-label>
          </slot>

          <slot
            v-else
            name="item"
            :node="entry.node"
            :to="m.nodeUri(entry.node)"
            :label="m.label(entry.node.label)"
            :subtitle="entry.node.subtitle ? m.label(entry.node.subtitle) : ''"
            :depth="entry.depth"
            :onClick="() => m.onItemClick(entry.node)"
            :open="() => m.open(entry.node)"
          >
            <q-item
              :to="m.nodeUri(entry.node)"
              clickable
              class="histrix-system-menu-item"
              :style="indent(entry.depth)"
              @click="m.onItemClick(entry.node)"
            >
              <q-item-section avatar>
                <q-icon :name="entry.node.icon || 'chevron_right'" size="18px" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="capitalize">{{ m.label(entry.node.label).toLowerCase() }}</q-item-label>
                <q-item-label v-if="entry.node.subtitle" caption>{{ m.label(entry.node.subtitle) }}</q-item-label>
              </q-item-section>
            </q-item>
          </slot>
        </template>
      </q-list>
    </q-menu>
  </q-btn>
</template>

<script>
import { computed, reactive, ref } from 'vue';
import { useHistrixSystemMenu } from '../../composables/useHistrixSystemMenu.js';
import { useHistrixI18n } from '../../services/i18n.js';

// Engranaje del menú de sistema de Histrix. La lógica (cuándo se muestra, el pedido de
// `phpmen-fsm`, la navegación) vive en useHistrixSystemMenu; acá sólo el diseño, que la app
// puede reemplazar por slots (ver el README).
export default {
  name: 'HistrixSystemMenu',
  emits: ['close'],
  props: {
    /** Ícono del botón. */
    icon: { type: String, default: 'settings' },
    /** Fuerza mostrarlo u ocultarlo; por defecto, `capabilities.systemMenu` del `/me`. */
    // `default: undefined` (y no `false`) para distinguir "no lo pasaron" de `:enabled="false"`.
    enabled: { type: Boolean, default: undefined }
  },
  setup(props, { emit }) {
    const { t } = useHistrixI18n();
    const isOpen = ref(false);
    const menu = useHistrixSystemMenu({
      enabled: props.enabled === undefined ? undefined : () => props.enabled,
      immediate: false,
      onClose: () => {
        isOpen.value = false;
        emit('close');
      }
    });

    return {
      t,
      m: reactive(menu),
      isOpen,
      title: computed(() => t('systemMenu.title')),
      indent: (depth) => (depth ? { paddingLeft: `${16 + depth * 12}px` } : undefined)
    };
  }
};
</script>

<style scoped>
.capitalize {
  text-transform: capitalize;
}
.histrix-system-menu-list {
  min-width: 260px;
  max-height: 70vh;
}
.histrix-system-menu-title {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}
.histrix-system-menu-section {
  font-weight: 600;
}
.histrix-system-menu-item :deep(.q-item__section--avatar) {
  min-width: 28px;
  padding-right: 8px;
}
</style>

<template>
  <!--
    Diseño alternativo del menú (HD-7733): la lógica (getMenu, favoritos, navegación,
    secciones abiertas) la sigue manejando HistrixExpansionMenu; acá sólo cambia el diseño,
    con slots (aplican en todos los niveles) y variables --histrix-menu-*.
  -->
  <HistrixExpansionMenu class="alt-menu" level="phpmen" :is-favorite="true" @close-drawer="$emit('close-drawer')">
    <template #loading>
      <div class="q-pa-md flex flex-center">
        <q-spinner-dots size="32px" color="primary" />
      </div>
    </template>

    <template #section-header="{ section, count, open }">
      <q-item-section>
        <div class="alt-section">
          {{ section === 'featured' ? '⚡ Accesos' : '★ Mis favoritos' }}
          <q-badge rounded :color="open ? 'primary' : 'grey-6'" :label="count" />
        </div>
      </q-item-section>
    </template>

    <!-- Sin :to: open() navega y cierra el drawer -->
    <template #featured-item="{ node, label, open }">
      <q-chip clickable outline color="primary" :icon="node.icon || 'bolt'" class="alt-chip" @click="open">
        {{ label }}
      </q-chip>
    </template>

    <template #favorite-item="{ label, open, toggleFavorite }">
      <q-item dense clickable @click="open">
        <q-item-section class="alt-leaf">{{ label }}</q-item-section>
        <q-item-section side>
          <q-btn flat round dense size="sm" icon="close" @click.stop="toggleFavorite" />
        </q-item-section>
      </q-item>
    </template>

    <template #branch-header="{ node, label }">
      <q-item-section avatar>
        <q-avatar size="28px" color="primary" text-color="white" :icon="node.icon || 'folder'" />
      </q-item-section>
      <q-item-section class="alt-branch">{{ label }}</q-item-section>
    </template>

    <template #leaf="{ to, label, subtitle, onClick, favoritesEnabled, isFavorite, toggleFavorite }">
      <q-item :to="to" dense class="alt-leaf-item" active-class="alt-leaf-item--active" @click="onClick">
        <q-item-section>
          <q-item-label class="alt-leaf">{{ label }}</q-item-label>
          <q-item-label v-if="subtitle" caption>{{ subtitle }}</q-item-label>
        </q-item-section>
        <q-item-section v-if="favoritesEnabled" side>
          <q-btn
            flat
            round
            dense
            size="sm"
            :icon="isFavorite ? 'favorite' : 'favorite_border'"
            :color="isFavorite ? 'pink' : 'grey-5'"
            @click.stop.prevent="toggleFavorite"
          />
        </q-item-section>
      </q-item>
    </template>
  </HistrixExpansionMenu>
</template>

<script>
export default {
  name: 'AltMenu',
  emits: ['close-drawer']
};
</script>

<style scoped>
/* Variables del diseño default que siguen en uso (separador, hover de las ramas…). */
.alt-menu {
  --histrix-menu-hover-bg: rgba(233, 30, 99, 0.06);
  --histrix-menu-favorite: #e91e63;
}
.alt-section {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.alt-chip {
  margin: 2px 4px;
}
.alt-branch {
  font-weight: 600;
}
.alt-leaf {
  text-transform: capitalize;
}
.alt-leaf-item {
  border-left: 3px solid transparent;
}
.alt-leaf-item--active {
  border-left-color: #e91e63;
  background: rgba(233, 30, 99, 0.08);
}
</style>

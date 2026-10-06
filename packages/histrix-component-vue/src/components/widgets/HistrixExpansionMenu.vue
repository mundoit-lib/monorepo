<template>
  <div class="histrix-menu">
    <q-list padding>
      <template v-if="isRoot && m.loading">
        <slot name="loading">
          <q-item v-for="n in 6" :key="`sk-${n}`">
            <q-item-section avatar>
              <q-skeleton type="QAvatar" size="24px" />
            </q-item-section>
            <q-item-section>
              <q-skeleton type="text" />
            </q-item-section>
          </q-item>
        </slot>
      </template>

      <!-- DESTACADOS -->
      <q-expansion-item
        v-if="isRoot && m.featured.length"
        v-model="m.featuredOpen"
        dense
        dense-toggle
        :duration="160"
        header-class="menu-section-header"
      >
        <template v-slot:header>
          <slot name="section-header" section="featured" :count="m.featured.length" :open="m.featuredOpen">
            <q-item-section avatar class="menu-section-avatar">
              <q-icon name="bolt" size="20px" class="menu-section-icon--featured" />
            </q-item-section>
            <q-item-section>
              <div class="menu-section-label menu-section-label--featured">
                <span>{{ t('menu.featured') }}</span>
                <span class="menu-section-count">{{ m.featured.length }}</span>
              </div>
            </q-item-section>
          </slot>
        </template>

        <div class="featured-zone">
          <template v-for="node in m.featured" :key="`feat-${node.menuId}`">
            <slot
              name="featured-item"
              :node="node"
              :to="m.nodeUri(node)"
              :label="m.label(node.label)"
              :subtitle="node.subtitle ? m.label(node.subtitle) : ''"
              :onClick="() => m.onItemClick(node)"
              :open="() => m.open(node)"
            >
              <q-item :to="m.nodeUri(node)" dense clickable class="featured-row" @click="m.onItemClick(node)">
                <q-item-section avatar class="featured-row-avatar">
                  <span class="featured-row-icon">
                    <q-icon :name="node.icon || 'bolt'" size="16px" />
                  </span>
                </q-item-section>
                <q-item-section>
                  <q-item-label class="featured-row-label capitalize">
                    {{ m.label(node.label).toLowerCase() }}
                  </q-item-label>
                  <q-item-label v-if="node.subtitle" caption class="featured-row-sub capitalize">
                    {{ m.label(node.subtitle).toLowerCase() }}
                  </q-item-label>
                </q-item-section>
              </q-item>
            </slot>
          </template>
        </div>
      </q-expansion-item>

      <!-- FAVORITOS -->
      <q-expansion-item
        v-if="isRoot && m.favoritesEnabled() && m.favorites.length"
        v-model="m.favoritesOpen"
        dense
        dense-toggle
        :duration="160"
        header-class="menu-section-header"
      >
        <template v-slot:header>
          <slot name="section-header" section="favorites" :count="m.favorites.length" :open="m.favoritesOpen">
            <q-item-section avatar class="menu-section-avatar">
              <q-icon name="star" size="20px" class="menu-section-icon--fav" />
            </q-item-section>
            <q-item-section>
              <div class="menu-section-label menu-section-label--fav">
                <span>{{ t('menu.favorites') }}</span>
                <span class="menu-section-count">{{ m.favorites.length }}</span>
              </div>
            </q-item-section>
          </slot>
        </template>

        <template v-for="fav in m.favorites" :key="`fav-${fav.menuId}`">
          <slot
            name="favorite-item"
            :favorite="fav"
            :to="m.nodeUri(favoriteNode(fav))"
            :label="m.label(fav.name)"
            :onClick="() => m.onItemClick(favoriteNode(fav))"
            :open="() => m.open(favoriteNode(fav))"
            :toggleFavorite="() => m.toggleFavorite(fav)"
          >
            <q-item
              :to="m.nodeUri(favoriteNode(fav))"
              dense
              clickable
              class="menu-leaf"
              @click="m.onItemClick(favoriteNode(fav))"
            >
              <q-item-section class="capitalize menu-leaf-label">
                {{ m.label(fav.name).toLowerCase() }}
              </q-item-section>
              <q-item-section side class="fav-star fav-star--active" @click.stop.prevent="m.toggleFavorite(fav)">
                <q-btn flat round dense icon="star" class="fav-star-btn" :aria-label="t('menu.removeFavorite')" />
              </q-item-section>
            </q-item>
          </slot>
        </template>
      </q-expansion-item>

      <q-separator
        v-if="isRoot && (m.featured.length || (m.favoritesEnabled() && m.favorites.length))"
        class="menu-divider"
      />

      <!-- ÁRBOL DE NAVEGACIÓN -->
      <div v-for="node in nodes" :key="node.menuId || node.key">
        <q-expansion-item
          v-if="node.children"
          dense
          :content-inset-level="0.2"
          :group="level"
          :duration="160"
          :label-lines="1"
          header-class="menu-branch"
        >
          <template v-slot:header>
            <slot
              name="branch-header"
              :node="node"
              :label="m.label(node.label)"
              :subtitle="node.subtitle ? m.label(node.subtitle) : ''"
            >
              <q-item-section avatar class="menu-branch-avatar">
                <q-icon :name="node.icon || 'folder_open'" size="20px" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="menu-branch-label capitalize">
                  {{ m.label(node.label).toLowerCase() }}
                </q-item-label>
                <q-item-label v-if="node.subtitle" caption class="capitalize">
                  {{ m.label(node.subtitle).toLowerCase() }}
                </q-item-label>
              </q-item-section>
            </slot>
          </template>

          <HistrixExpansionMenu
            :tree="node.children"
            :favorites="{ keys: m.favorites }"
            :is-favorite="m.favoritesEnabled()"
            :mini="mini"
            @close-drawer="$emit('close-drawer')"
          >
            <!-- Los slots de la app aplican en todos los niveles -->
            <template v-for="(_, name) in $slots" #[name]="scope">
              <slot :name="name" v-bind="scope || {}" />
            </template>
          </HistrixExpansionMenu>
        </q-expansion-item>

        <slot
          v-else
          name="leaf"
          :node="node"
          :to="m.nodeUri(node)"
          :label="m.label(node.label)"
          :subtitle="node.subtitle ? m.label(node.subtitle) : ''"
          :onClick="() => m.onItemClick(node)"
          :open="() => m.open(node)"
          :favoritesEnabled="m.favoritesEnabled()"
          :isFavorite="m.isFavorite(node.menuId)"
          :toggleFavorite="() => m.toggleFavorite(node)"
        >
          <q-item :to="m.nodeUri(node)" class="menu-leaf" @click="m.onItemClick(node)">
            <q-item-section avatar class="menu-leaf-avatar">
              <q-icon v-if="node.icon" :name="node.icon" size="20px" />
              <span v-else class="menu-leaf-dot" />
            </q-item-section>
            <q-item-section class="capitalize menu-leaf-label">
              <q-item-label>
                {{ m.label(node.label).toLowerCase() }}
              </q-item-label>
              <q-item-label v-if="node.subtitle" caption>
                {{ m.label(node.subtitle).toLowerCase() }}
              </q-item-label>
            </q-item-section>
            <q-item-section
              v-if="m.favoritesEnabled()"
              side
              class="fav-star"
              :class="{ 'fav-star--active': m.isFavorite(node.menuId) }"
              @click.stop.prevent="m.toggleFavorite(node)"
            >
              <q-btn
                flat
                round
                dense
                :icon="m.isFavorite(node.menuId) ? 'star' : 'star_border'"
                class="fav-star-btn"
                :aria-label="m.isFavorite(node.menuId) ? t('menu.removeFavorite') : t('menu.addFavorite')"
              />
            </q-item-section>
          </q-item>
        </slot>
      </div>
    </q-list>
  </div>
</template>

<script>
import { computed, reactive, watch } from 'vue';
import { injectHistrixMenu, useHistrixMenu } from '../../composables/useHistrixMenu.js';
import { useHistrixI18n } from '../../services/i18n.js';

// La lógica (pedido del menú, favoritos, navegación, secciones abiertas) vive en useHistrixMenu;
// acá sólo el diseño, que la app puede reemplazar por slots (ver el README).
export default {
  name: 'HistrixExpansionMenu',
  // update-favorit también sale por el bus (compat; el menú es recursivo y la app lo escucha ahí).
  emits: ['close-drawer', 'update-favorit'],
  props: {
    level: String,
    isFavorite: {
      type: Boolean,
      default: false
    },
    tree: { type: Array, default: null },
    mini: Boolean,
    favorites: {
      type: Object,
      default: () => ({ keys: [] })
    }
  },
  setup(props, { emit }) {
    const isRoot = !props.tree;
    // Los niveles anidados comparten el estado del menú raíz. Un `tree` suelto (sin raíz arriba)
    // arma el suyo con los favoritos que llegan por props, como antes.
    const injected = isRoot ? null : injectHistrixMenu();
    const menu =
      injected ||
      useHistrixMenu({
        level: () => props.level,
        favorites: () => props.isFavorite,
        tree: props.tree,
        onClose: () => emit('close-drawer'),
        onFavoritesChange: () => emit('update-favorit')
      });
    if (!injected && !isRoot) {
      watch(
        () => props.favorites,
        (value) => {
          menu.favorites.value = value?.keys || [];
        },
        { immediate: true }
      );
    }

    return {
      t: useHistrixI18n().t,
      m: reactive(menu),
      isRoot,
      nodes: computed(() => (isRoot ? menu.tree.value : props.tree)),
      favoriteNode: (fav) => ({ menuId: fav.menuId, uri: fav.uri, label: fav.name })
    };
  }
};
</script>

<style scoped>
/* Colores: variables --histrix-menu-* que la app puede definir (en :root o en un ancestro del menú).
   Los defaults son los del diseño original. Ver la tabla en el README. */

.capitalize {
  text-transform: capitalize;
}

/* ───────────── Cabeceras de sección (Destacados / Favoritos) ───────────── */
.histrix-menu :deep(.menu-section-header) {
  min-height: 34px;
  padding-left: 12px;
  padding-right: 8px;
}
.menu-section-avatar {
  min-width: 28px;
  padding-right: 6px;
}
.menu-section-icon--featured {
  color: var(--histrix-menu-accent, var(--q-primary));
}
.menu-section-icon--fav {
  color: var(--histrix-menu-favorite, #f59e0b);
}
.menu-section-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}
.menu-section-label--featured {
  color: var(--histrix-menu-accent, var(--q-primary));
}
.menu-section-label--fav {
  color: var(--histrix-menu-favorite, #f59e0b);
}
.menu-section-count {
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0;
  color: var(--histrix-menu-count-color, #94a3b8);
  background: var(--histrix-menu-count-bg, rgba(148, 163, 184, 0.16));
  border-radius: 999px;
  padding: 0 6px;
  line-height: 1.5;
}

/* ───────────── Destacados: lista de accesos en bloque teñido ───────────── */
.featured-zone {
  margin: 2px 10px 4px;
  padding: 4px;
  border-radius: 12px;
}
.featured-row {
  border-radius: 8px;
  min-height: 38px;
  padding: 4px 8px;
  transition: background 0.15s ease;
}
.featured-row:hover {
  background: color-mix(in srgb, var(--histrix-menu-accent, var(--q-primary)) 12%, transparent);
}
.featured-row.q-router-link--active {
  background: color-mix(in srgb, var(--histrix-menu-accent, var(--q-primary)) 18%, transparent);
}
.featured-row-avatar {
  min-width: 34px;
  padding-right: 8px;
}
.featured-row-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  background: var(--histrix-menu-accent, var(--q-primary));
  color: var(--histrix-menu-accent-contrast, #fff);
}
.featured-row-label {
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.2;
  color: var(--histrix-menu-accent, var(--q-primary));
}
.featured-row-sub {
  font-size: 0.68rem;
  line-height: 1.15;
  color: var(--histrix-menu-muted, #64748b);
}

/* ───────────── Separador ───────────── */
.menu-divider {
  margin: 6px 12px;
  opacity: 0.6;
}

/* ───────────── Ramas (secciones con hijos) ───────────── */
.histrix-menu :deep(.menu-branch) {
  min-height: 40px;
  border-radius: 8px;
  margin: 1px 8px;
  transition: background 0.15s ease;
}
.histrix-menu :deep(.menu-branch:hover) {
  background: var(--histrix-menu-hover-bg, rgba(15, 23, 42, 0.045));
}
.menu-branch-avatar {
  min-width: 28px;
  padding-right: 8px;
}
.menu-branch-avatar :deep(.q-icon) {
  color: var(--histrix-menu-muted, #64748b);
}
.menu-branch-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--histrix-menu-branch-color, #1e293b);
}

/* ───────────── Hojas (items finales) ───────────── */
.menu-leaf {
  position: relative;
  border-radius: 8px;
  margin: 1px 8px;
  min-height: 36px;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.menu-leaf:hover {
  background: var(--histrix-menu-hover-bg, rgba(15, 23, 42, 0.045));
}
.menu-leaf-avatar {
  min-width: 28px;
  padding-right: 8px;
}
.menu-leaf-avatar :deep(.q-icon) {
  color: var(--histrix-menu-muted, #64748b);
}
/* Título de la hoja (no el subtítulo, que se mantiene como caption más chico y gris) */
.menu-leaf-label :deep(.q-item__label:not(.q-item__label--caption)) {
  font-size: 0.8rem;
  color: var(--histrix-menu-leaf-color, #334155);
}
.menu-leaf-label :deep(.q-item__label--caption) {
  font-size: 0.7rem;
  line-height: 1.2;
}
.menu-leaf-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--histrix-menu-dot, #cbd5e1);
  margin-left: 7px;
  transition: background 0.15s ease;
}
.menu-leaf:hover .menu-leaf-dot {
  background: var(--histrix-menu-dot-hover, #94a3b8);
}

/* Item de la ruta activa: riel lateral + fondo teñido con el color de marca */
.menu-leaf.q-router-link--active {
  background: var(
    --histrix-menu-active-bg,
    color-mix(in srgb, var(--histrix-menu-accent, var(--q-primary)) 11%, white)
  );
}
.menu-leaf.q-router-link--active .menu-leaf-label :deep(.q-item__label:not(.q-item__label--caption)) {
  color: var(--histrix-menu-accent, var(--q-primary));
  font-weight: 600;
}
.menu-leaf.q-router-link--active .menu-leaf-dot {
  background: var(--histrix-menu-accent, var(--q-primary));
}
.menu-leaf.q-router-link--active::before {
  content: '';
  position: absolute;
  left: -8px;
  top: 50%;
  transform: translateY(-50%);
  height: 56%;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--histrix-menu-accent, var(--q-primary));
}

/* ───────────── Estrella de favorito ─────────────
   Oculta por defecto. Aparece al pasar el mouse, al enfocar con teclado,
   en el item activo, o cuando ya es favorito (siempre visible y dorada). */
.fav-star {
  opacity: 0;
  transform: scale(0.8);
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.menu-leaf:hover .fav-star,
.menu-leaf:focus-within .fav-star,
.menu-leaf.q-router-link--active .fav-star,
.fav-star--active {
  opacity: 1;
  transform: scale(1);
}
.fav-star-btn {
  color: var(--histrix-menu-star, #b6c0cf);
  transition:
    color 0.16s ease,
    transform 0.16s ease;
}
.fav-star:hover .fav-star-btn {
  color: var(--histrix-menu-favorite, #f59e0b);
  transform: scale(1.12);
}
.fav-star--active .fav-star-btn {
  color: var(--histrix-menu-favorite, #f59e0b);
}

/* Dispositivos táctiles (sin hover): mantener visibles para que sean alcanzables */
@media (hover: none) {
  .fav-star {
    opacity: 1;
    transform: scale(1);
  }
}

:deep(.q-item__section--avatar) {
  min-width: 28px;
  padding-right: 8px;
}
</style>

<template>
  <q-layout view="hHh lpR fFf">
    <!-- En las pantallas de auth (login/registro/recupero/reset) no mostramos el
         chrome del playground: son full-screen (meta.fullscreen en el router). -->
    <q-header v-if="!isAuthScreen" elevated class="bg-primary text-white">
      <q-toolbar>
        <q-btn v-if="loggedIn" flat dense round icon="menu" aria-label="Menú" @click="drawer = !drawer" />
        <q-toolbar-title>
          Histrix Dev Playground
          <span class="text-caption q-ml-sm" style="opacity: 0.8">
            {{ dbLabel }}
          </span>
        </q-toolbar-title>

        <HistrixMenuSearch v-if="loggedIn" level="phpmen" placeholder="Buscar en el menú…" class="q-mr-sm" />
        <!-- Engranaje del menú de sistema: sólo si el /me trae capabilities.systemMenu -->
        <HistrixSystemMenu v-if="loggedIn" class="q-mr-sm" />

        <!-- Switch de prueba del i18n de la lib (HD-7530): cambia el locale en caliente. -->
        <q-btn-toggle
          v-model="locale"
          :options="[
            { label: 'es', value: 'es' },
            { label: 'en', value: 'en' }
          ]"
          flat
          dense
          no-caps
          toggle-color="white"
          class="q-mr-sm"
          aria-label="Idioma"
        />
        <q-btn flat dense no-caps icon="home" label="Home" :to="{ name: 'home' }" />
        <q-btn v-if="!loggedIn" flat dense no-caps icon="login" label="Login" :to="{ name: 'login' }" />
        <q-btn v-else flat dense no-caps icon="logout" label="Salir" @click="logout" />
      </q-toolbar>
    </q-header>

    <q-drawer v-if="loggedIn && !isAuthScreen" v-model="drawer" show-if-above bordered :width="300" class="bg-grey-1">
      <q-scroll-area class="fit">
        <div class="row items-center justify-between q-pa-md">
          <span class="text-caption text-grey-7">Menú Histrix (nivel raíz)</span>
          <!-- HD-7733: mismo menú con el diseño default o con uno alternativo hecho con slots -->
          <q-btn-toggle
            v-model="menuDesign"
            :options="[
              { label: 'Default', value: 'default' },
              { label: 'Slots', value: 'alt' }
            ]"
            dense
            no-caps
            size="sm"
            toggle-color="primary"
          />
        </div>
        <!--
          HistrixExpansionMenu pide el menú con getMenu(level) al montar.
          Sin level usa el nivel raíz. Necesita sesión válida (de ahí el v-if).
        -->
        <AltMenu v-if="menuDesign === 'alt'" @close-drawer="drawer = false" />
        <HistrixExpansionMenu v-else :is-favorite="true" @close-drawer="drawer = false" level="phpmen" />
      </q-scroll-area>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script>
import { useHistrixI18n, useHistrixSession, useHistrixStorage } from '@mundoit-lib/histrix-component-vue';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import AltMenu from './AltMenu.vue';
import config from './setup.js';

export default {
  name: 'App',
  components: { AltMenu },
  setup() {
    const router = useRouter();
    const route = useRoute();
    // Sesión de la librería: única fuente de `user` (sin leer localStorage a mano).
    const session = useHistrixSession();
    const storage = useHistrixStorage();
    // Locale reactivo de la lib: el toggle del header lo cambia en caliente.
    const { locale } = useHistrixI18n();

    // Pantallas full-screen sin chrome (login/registro/recupero/reset).
    const isAuthScreen = computed(() => route.meta.fullscreen === true);

    const drawer = ref(false);
    const menuDesign = ref('default');
    const loggedIn = session.isLogged;

    const dbLabel = computed(() => {
      const db = storage.get('database') || config.db || '(sin db)';
      const host = (storage.get('host') || config.apiUrl || '').replace(/^https?:\/\//, '');
      return host ? `${db} @ ${host}` : db;
    });

    const logout = () => {
      session.logout();
      router.push({ name: 'login' });
    };

    return { drawer, menuDesign, loggedIn, isAuthScreen, dbLabel, logout, locale };
  }
};
</script>

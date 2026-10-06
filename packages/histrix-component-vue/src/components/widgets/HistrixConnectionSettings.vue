<template>
  <div class="col q-pa-md text-center">
    <h5>{{ t('connection.title') }}</h5>
    <q-form @submit="save">
      <q-input v-model="host" class="q-mt-sm" :label="t('connection.path')" :hint="t('connection.pathHint')"></q-input>

      <DatabaseSelector
        :host="host"
        :label="t('connection.database')"
        :model-value="database"
        @update:model-value="database = $event"
        :hint="t('connection.databaseHint')"
      />
      <br />

      <q-btn
        class="bg-primary"
        text-color="white"
        icon="save"
        v-close-popup="3"
        type="submit"
        :label="t('common.save')"
      ></q-btn>
      <q-btn flat text-color="primary" v-close-popup="3" :label="t('common.cancel')"></q-btn>
    </q-form>
  </div>
</template>

<script>
import config from '../../services/config.js';
import useApi from '../../services/histrixApi.js';
import { useHistrixI18n } from '../../services/i18n.js';
import { useHistrixStorage } from '../../services/storage.js';

// Cambia la conexión activa (host y base). Escribe `config` (fuente viva, la que
// lee histrixApi) y el storage (fallback para las apps que no setean config).
export default {
  name: 'HistrixConnectionSettings',
  setup() {
    const api = useApi();
    return { t: useHistrixI18n().t, storage: useHistrixStorage(), api };
  },
  data() {
    return {
      host: null,
      database: null
    };
  },
  mounted() {
    // Valores efectivos (config o storage), no sólo lo guardado.
    this.host = this.api.host() || null;
    this.database = this.api.currentDb() || null;
  },
  methods: {
    async save() {
      config.apiUrl = this.host || '';
      config.db = this.database || '';
      this.storage.set('host', this.host);
      this.storage.set('database', this.database);
      this.$emit('change-database');
    }
  },
  emits: ['change-database']
};
</script>

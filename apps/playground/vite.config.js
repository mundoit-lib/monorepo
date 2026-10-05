import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

import { quasar, transformAssetUrls } from '@quasar/vite-plugin';
import vue from '@vitejs/plugin-vue';
import Unocss from 'unocss/vite';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
// Raíz del monorepo: la librería (packages/histrix-component-vue) y los plugins
// llegan por `workspace:*` (symlink vivo: editar su src se refleja al instante)
// y Vite tiene que poder leer sus .vue a través del symlink de node_modules.
const monorepoRoot = resolve(here, '..', '..');

// Resolución portable (npm y pnpm) del Quasar 2 del playground. Con pnpm el
// layout físico de node_modules es distinto (symlinks a .pnpm/), así que nunca
// hay que armar rutas a mano: require.resolve atraviesa los symlinks.
const require = createRequire(import.meta.url);
const quasarSrc = resolve(dirname(require.resolve('quasar/package.json')), 'src');

export default defineConfig({
  plugins: [
    vue({
      template: { transformAssetUrls }
    }),
    quasar({
      sassVariables: fileURLToPath(new URL('./src/quasar-variables.sass', import.meta.url))
    }),
    // Utility classes estilo Tailwind, como en todas las apps de Mundo IT
    // (config en unocss.config.js, espejo del de las apps *-frontend).
    Unocss()
  ],

  resolve: {
    // Una sola copia de vue / quasar en todo el grafo, aunque la librería
    // del workspace tenga su propio node_modules con copias.
    dedupe: ['vue', 'quasar', '@vuelidate/core', '@vuelidate/validators'],
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      // El @quasar/vite-plugin inyecta imports profundos `quasar/src/...`
      // (p.ej. el directive v-ripple) en los .vue de la librería; al compilarse
      // a través del symlink deben resolver contra el Quasar 2 del playground.
      { find: /^quasar\/src\//, replacement: `${quasarSrc}/` }
    ]
  },

  // `services/config.js` de la librería usa `process.env.X`. En el browser no
  // existe `process`; esto evita el ReferenceError. Los valores reales se
  // setean en runtime desde import.meta.env.VITE_* (ver src/setup.js).
  define: {
    'process.env': {}
  },

  optimizeDeps: {
    // La librería es source-only (.vue sin compilar) y está symlinkeada.
    // Hay que excluirla del pre-bundle para que Vite compile sus .vue con el
    // plugin de Vue en lugar de tratarla como dependencia ya construida.
    exclude: ['@mundoit-lib/histrix-component-vue'],
    // Estas sí conviene pre-bundlearlas (la lib las importa internamente).
    include: ['@vuelidate/core', '@vuelidate/validators', 'echarts', 'vue-echarts', '@quasar/quasar-ui-qcalendar']
  },

  server: {
    port: 5180,
    fs: {
      // Permitir que el dev server sirva archivos del monorepo (la librería y los
      // plugins del workspace) a través de los symlinks de node_modules.
      allow: [monorepoRoot]
    }
  }
});

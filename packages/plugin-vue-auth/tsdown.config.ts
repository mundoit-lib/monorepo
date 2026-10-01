import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  // Navegador y bundlers: ESM en .js y CJS en .cjs (el paquete es "type": "module").
  platform: 'neutral',
  fixedExtension: false,
  dts: true,
  clean: true,
  target: 'es2022',
  minify: false,
  // default + exports con nombre a propósito (compatibilidad con 1.x).
  outputOptions: { exports: 'named' }
});

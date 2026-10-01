import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/plugin.ts', 'src/eventBus.ts', 'src/useEvents.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: false,
  clean: true,
  minify: false,
  target: 'es2022',
  ignoreWatch: ['**/node_modules/**'],
  watch: process.env.NODE_ENV === 'development',
  outDir: 'dist',
  legacyOutput: false,
  splitting: true,
  treeshake: true,
  shims: false,
  bundle: true,
  platform: 'neutral',
  tsconfig: 'tsconfig.json',
  metafile: false
});

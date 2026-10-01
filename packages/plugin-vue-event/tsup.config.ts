import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/plugin.ts', 'src/eventBus.ts'],
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
  splitting: false,
  treeshake: true,
  shims: true,
  bundle: true,
  platform: 'neutral',
  entryPoints: ['src/index.ts', 'src/plugin.ts', 'src/eventBus.ts'],
  tsconfig: 'tsconfig.json',
  env: {
    NODE_ENV: 'production'
  },
  metafile: false
});

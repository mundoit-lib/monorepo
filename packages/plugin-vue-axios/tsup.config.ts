import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: false,
  clean: true,
  minify: true,
  target: 'node14',
  external: ['axios'],
  ignoreWatch: ['**/node_modules/**'],
  watch: process.env.NODE_ENV === 'development',
  outDir: 'dist',
  legacyOutput: true,
  splitting: false,
  treeshake: true,
  bundle: true,
  entryPoints: ['src/index.ts'],
  tsconfig: 'tsconfig.json',
  env: {
    NODE_ENV: 'production',
  },
  metafile: false,
});
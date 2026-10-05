import { defineConfig, type UserConfig } from 'tsdown';

export interface LibraryConfigOptions {
  /** Entradas del paquete, relativas a su raíz (`['src/index.ts']`, o varias para subpath exports). */
  entry: string[];
}

/**
 * Config tsdown común a las librerías publicadas del monorepo.
 *
 * - ESM en `.js` y CJS en `.cjs` (los paquetes son `"type": "module"`), para navegador y bundlers.
 * - `es2022` sin minificar: minifica el bundler de la app y los stack traces quedan legibles.
 * - `exports: 'named'`: default + exports con nombre a propósito (compatibilidad con 1.x).
 */
export function libraryConfig({ entry }: LibraryConfigOptions): UserConfig {
  return defineConfig({
    entry,
    format: ['esm', 'cjs'],
    platform: 'neutral',
    fixedExtension: false,
    dts: true,
    clean: true,
    target: 'es2022',
    minify: false,
    outputOptions: { exports: 'named' }
  });
}

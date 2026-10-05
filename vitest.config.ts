import { readdirSync } from 'node:fs';
import { basename } from 'node:path';
import { defineConfig } from 'vitest/config';

// Config compartida. Cada paquete la usa con `vitest run --config ../../vitest.config.ts` (turbo run test),
// con root en el paquete. Desde la raíz (pnpm test:watch) cada paquete es un project con su propio root,
// para que el typecheck use el tsconfig.json del paquete.
const enRaiz = process.cwd() === import.meta.dirname;

// TZ fijo sólo para histrix-component-vue: sus tests de fechas preservan el workaround de timezone del motor.
// El resto de los paquetes corre con la TZ de la máquina.
const envDe = (paquete: string) => (paquete === 'histrix-component-vue' ? { TZ: 'UTC' } : undefined);

export default defineConfig({
  test: {
    environment: 'node',
    // .test.js: histrix-component-vue es JavaScript (fuente publicada tal cual, sin build).
    include: ['**/src/**/*.test.ts', '**/src/**/*.test.js'],
    env: enRaiz ? undefined : envDe(basename(process.cwd())),
    passWithNoTests: true,
    // Tests de tipos (expectTypeOf, @ts-expect-error): los valida tsc con el tsconfig del paquete.
    typecheck: {
      enabled: true,
      include: ['**/src/**/*.test-d.ts']
    },
    projects: enRaiz
      ? readdirSync('packages', { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map(({ name }) => ({
            extends: true,
            test: { name, root: `packages/${name}`, env: envDe(name) }
          }))
      : undefined
  }
});

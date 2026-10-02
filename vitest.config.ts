import { readdirSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Config compartida. Cada paquete la usa con `vitest run --config ../../vitest.config.ts` (turbo run test),
// con root en el paquete. Desde la raíz (pnpm test:watch) cada paquete es un project con su propio root,
// para que el typecheck use el tsconfig.json del paquete.
const enRaiz = process.cwd() === import.meta.dirname;

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/src/**/*.test.ts'],
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
            test: { name, root: `packages/${name}` }
          }))
      : undefined
  }
});

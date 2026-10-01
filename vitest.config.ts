import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Relativo a donde se corre: sirve desde la raíz y desde cada paquete (turbo run test).
    include: ['**/src/**/*.test.ts'],
    passWithNoTests: true
  }
});

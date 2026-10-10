import { defineConfig } from 'vitest/config';

process.env.DATABASE_URL ??= 'postgres://uhishange:uhishange@localhost:54329/uhishange_test';
process.env.NODE_ENV = 'test';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      enabled: true,
      include: [
        'src/server/**/*.ts',
        'src/client/api.ts',
        'src/shared/serviceForms.ts',
        'src/shared/pricing.ts',
      ],
      exclude: ['src/server/server.ts', 'src/server/worker.ts'],
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
    },
  },
});

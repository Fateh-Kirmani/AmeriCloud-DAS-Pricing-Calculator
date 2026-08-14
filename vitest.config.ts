import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./vitest.setup.ts'],
    // Multiple integration test files mutate/scan the same shared local Postgres tables.
    // Run test FILES sequentially to avoid cross-file races against that shared state.
    fileParallelism: false,
    // Dev/test now points at a remote Neon database (no local Docker Postgres available),
    // so per-test network round-trips are much slower than the default 5s assumes.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  esbuild: {
    jsx: 'automatic',
  },
});

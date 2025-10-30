import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup/msw.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['tests/**/*.spec.ts'],
    css: false,
    watch: false,
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: Number(process.env.VITEST_MAX_THREADS ?? 2),
        minThreads: 1
      }
    },
    sequence: { concurrent: false },
    coverage: {
      enabled: !!process.env.COVERAGE,
      reporter: ['text', 'lcov']
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.')
    }
  },
  esbuild: {
    jsx: 'automatic',
    jsxInject: `import React from 'react'`
  }
});

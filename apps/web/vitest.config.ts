import { defineConfig } from 'vitest/config';

// Unit tests for the app's pure modules. Playwright owns e2e/.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});

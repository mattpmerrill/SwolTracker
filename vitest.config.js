import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.{js,jsx}', 'mcp/src/**/*.test.{ts,tsx}', 'api/**/*.test.js'],
    exclude: ['node_modules', 'dist', 'mobile', 'mcp/dist'],
  },
});

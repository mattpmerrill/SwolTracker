import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // The first run downloads the Temporal test server, and every file bundles the workflow code.
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // One Temporal test environment at a time keeps the time-skipping server quiet and the logs readable.
    fileParallelism: false,
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/e2e/**/*.test.ts"],
    exclude: ["src/**/*.test.ts"], // Explicitly exclude unit tests
    testTimeout: 30000, // E2E tests may take longer
    isolate: true, // Run each test file in isolation
  },
});

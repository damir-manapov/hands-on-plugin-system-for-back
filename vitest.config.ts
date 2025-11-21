import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["test/e2e/**/*.test.ts"], // Exclude e2e tests from unit tests
  },
});

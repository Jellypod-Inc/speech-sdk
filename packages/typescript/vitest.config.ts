import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
    exclude: ["src/__tests__/e2e/**"],
  },
});

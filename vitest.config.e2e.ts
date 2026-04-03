import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config();

export default defineConfig({
  test: {
    globals: true,
    include: ["src/__tests__/e2e/**/*.e2e.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});

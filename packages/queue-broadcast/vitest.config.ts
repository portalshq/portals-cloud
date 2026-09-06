import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      include: ["src/streaming/**/*.ts"],
      thresholds: { lines: 95 },
    },
  },
});

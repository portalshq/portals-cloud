import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      include: ["src/postgres-fanout-bus.ts", "src/index.ts"],
      thresholds: { lines: 95 },
    },
  },
});

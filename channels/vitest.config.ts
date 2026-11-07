import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      include: ["lib/admin/**", "app/api/admin/**"],
      thresholds: { lines: 95 },
    },
  },
});

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      include: ["lib/admin/**", "lib/x-card.ts", "app/api/admin/**", "components/background/chromatic-*.ts"],
      thresholds: { lines: 95 },
    },
  },
});

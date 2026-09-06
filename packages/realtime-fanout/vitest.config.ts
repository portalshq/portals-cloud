import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      include: ["src/fanout-bus.ts", "src/providers/chat-provider-registry.ts"],
      thresholds: { lines: 95 },
    },
  },
});

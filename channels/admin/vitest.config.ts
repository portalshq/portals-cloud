import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: [
        'src/api/client.ts',
        'src/hooks/usePolling.ts',
        'src/lib/dates.ts',
      ],
      reporter: ['text', 'text-summary'],
      thresholds: {
        lines: 80,
        functions: 70,
        branches: 60,
      },
    },
  },
})

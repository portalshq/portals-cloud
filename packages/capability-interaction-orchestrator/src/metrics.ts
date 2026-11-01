/** Optional operational metrics sink. Counters/gauges only — no viewer text. */
export interface InteractionMetrics {
  increment(name: string, tags?: Record<string, string>): void;
  observe(name: string, value: number, tags?: Record<string, string>): void;
}

export const noopMetrics: InteractionMetrics = {
  increment() {},
  observe() {},
};

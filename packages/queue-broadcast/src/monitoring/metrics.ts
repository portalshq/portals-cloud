/**
 * Simple metrics collection for monitoring streaming infrastructure.
 * Designed for containerized deployment with HTTP polling instead of WebSocket.
 */

export interface MetricsCollector {
  /** Get current metrics snapshot */
  getMetrics(): Record<string, unknown>;
  /** Reset all metrics */
  reset(): void;
}

export interface MetricSnapshot {
  timestamp: number;
  component: string;
  metrics: Record<string, unknown>;
}

/**
 * Simple metrics registry that can collect metrics from multiple components.
 * Provides HTTP-friendly metrics output for containerized environments.
 */
export class MetricsRegistry {
  private collectors: Map<string, MetricsCollector> = new Map();
  private history: MetricSnapshot[] = [];
  private latestMetrics: Record<string, MetricSnapshot> | null = null;
  private maxHistorySize: number;

  constructor(maxHistorySize: number = 300) {
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Register a metrics collector
   */
  register(componentName: string, collector: MetricsCollector): void {
    this.collectors.set(componentName, collector);
  }

  /**
   * Unregister a metrics collector
   */
  unregister(componentName: string): void {
    this.collectors.delete(componentName);
  }

  /**
   * Collect metrics from all registered components
   */
  collectMetrics(): Record<string, MetricSnapshot> {
    const timestamp = Date.now();
    const metrics: Record<string, MetricSnapshot> = {};

    for (const [componentName, collector] of this.collectors.entries()) {
      try {
        const componentMetrics = collector.getMetrics();
        metrics[componentName] = {
          timestamp,
          component: componentName,
          metrics: componentMetrics,
        };
      } catch (error) {
        metrics[componentName] = {
          timestamp,
          component: componentName,
          metrics: {
            error: error instanceof Error ? error.message : String(error),
            status: 'error',
          },
        };
      }
    }

    // Add to history
    const snapshot: MetricSnapshot = {
      timestamp,
      component: 'registry',
      metrics: {
        totalComponents: this.collectors.size,
        componentStatuses: Object.fromEntries(
          Object.entries(metrics).map(([name, snapshot]) => [
            name,
            snapshot.metrics.error ? 'error' : 'ok',
          ])
        ),
      },
    };
    this.history.push(snapshot);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    this.latestMetrics = metrics;
    return metrics;
  }

  /**
   * Get latest metrics snapshot
   */
  getLatestMetrics(): Record<string, MetricSnapshot> | null {
    if (this.history.length === 0) {
      return null;
    }
    return this.latestMetrics;
  }

  /**
   * Get metrics history
   */
  getHistory(durationMs?: number): MetricSnapshot[] {
    if (!durationMs) {
      return [...this.history];
    }

    const cutoff = Date.now() - durationMs;
    return this.history.filter(snapshot => snapshot.timestamp >= cutoff);
  }

  /**
   * Reset all collectors and history
   */
  reset(): void {
    for (const collector of this.collectors.values()) {
      try {
        collector.reset();
      } catch (error) {
        console.error(`Error resetting collector: ${error}`);
      }
    }
    this.history = [];
    this.latestMetrics = null;
  }

  /**
   * Export metrics in Prometheus-compatible format
   */
  exportPrometheusFormat(): string {
    const metrics = this.collectMetrics();
    const lines: string[] = [];

    for (const [componentName, snapshot] of Object.entries(metrics)) {
      lines.push(`# Component: ${componentName}`);
      lines.push(`# Timestamp: ${new Date(snapshot.timestamp).toISOString()}`);

      for (const [key, value] of Object.entries(snapshot.metrics)) {
        if (typeof value === 'number') {
          lines.push(`${componentName}_${key} ${value}`);
        } else if (typeof value === 'boolean') {
          lines.push(`${componentName}_${key} ${value ? 1 : 0}`);
        } else if (typeof value === 'string') {
          lines.push(`${componentName}_${key} "${value}"`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

/**
 * Simple metrics collector for basic counter and gauge metrics
 */
export class SimpleMetrics implements MetricsCollector {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private labels: Map<string, string> = new Map();

  /**
   * Increment a counter
   */
  incrementCounter(name: string, value: number = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
  }

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  /**
   * Get counter value
   */
  getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  /**
   * Get gauge value
   */
  getGauge(name: string): number {
    return this.gauges.get(name) || 0;
  }

  /**
   * Set a label (metadata)
   */
  setLabel(name: string, value: string): void {
    this.labels.set(name, value);
  }

  /**
   * Get all metrics
   */
  getMetrics(): Record<string, unknown> {
    const metrics: Record<string, unknown> = {
      ...Object.fromEntries(this.counters),
      ...Object.fromEntries(this.gauges),
      ...Object.fromEntries(this.labels),
    };
    return metrics;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.labels.clear();
  }
}

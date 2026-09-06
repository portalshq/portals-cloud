/**
 * Chat-specific metrics for monitoring message throughput and performance.
 */

export interface ChatMetricsSnapshot {
  timestamp: number;
  messagesReceived: number;
  messagesSent: number;
  messagesDropped: number;
  averageLatency: number;
  connectedProviders: number;
  activeSubscribers: number;
}

/**
 * Metrics collector for chat infrastructure.
 * Tracks message throughput, latency, and connection health.
 */
export class ChatMetricsCollector {
  private messagesReceived: number = 0;
  private messagesSent: number = 0;
  private messagesDropped: number = 0;
  private latencySum: number = 0;
  private latencyCount: number = 0;
  private connectedProviders: Set<string> = new Set();
  private activeSubscribers: number = 0;
  private history: ChatMetricsSnapshot[] = [];
  private maxHistorySize: number = 300;

  /**
   * Record a received message
   */
  recordMessageReceived(): void {
    this.messagesReceived++;
  }

  /**
   * Record a sent message
   */
  recordMessageSent(): void {
    this.messagesSent++;
  }

  /**
   * Record a dropped message
   */
  recordMessageDropped(): void {
    this.messagesDropped++;
  }

  /**
   * Record message latency in milliseconds
   */
  recordLatency(latencyMs: number): void {
    this.latencySum += latencyMs;
    this.latencyCount++;
  }

  /**
   * Register a connected provider
   */
  registerProvider(providerName: string): void {
    this.connectedProviders.add(providerName);
  }

  /**
   * Unregister a provider
   */
  unregisterProvider(providerName: string): void {
    this.connectedProviders.delete(providerName);
  }

  /**
   * Set the number of active subscribers
   */
  setActiveSubscribers(count: number): void {
    this.activeSubscribers = count;
  }

  /**
   * Get current metrics snapshot
   */
  getSnapshot(): ChatMetricsSnapshot {
    const averageLatency = this.latencyCount > 0
      ? this.latencySum / this.latencyCount
      : 0;

    const snapshot: ChatMetricsSnapshot = {
      timestamp: Date.now(),
      messagesReceived: this.messagesReceived,
      messagesSent: this.messagesSent,
      messagesDropped: this.messagesDropped,
      averageLatency: Math.round(averageLatency * 100) / 100,
      connectedProviders: this.connectedProviders.size,
      activeSubscribers: this.activeSubscribers,
    };

    this.history.push(snapshot);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    return snapshot;
  }

  /**
   * Get metrics history
   */
  getHistory(durationMs?: number): ChatMetricsSnapshot[] {
    if (!durationMs) {
      return [...this.history];
    }

    const cutoff = Date.now() - durationMs;
    return this.history.filter(snapshot => snapshot.timestamp >= cutoff);
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.messagesReceived = 0;
    this.messagesSent = 0;
    this.messagesDropped = 0;
    this.latencySum = 0;
    this.latencyCount = 0;
    this.connectedProviders.clear();
    this.activeSubscribers = 0;
    this.history = [];
  }

  /**
   * Get current throughput (messages per second over last minute)
   */
  getThroughput(): { received: number; sent: number } {
    const oneMinuteAgo = Date.now() - 60000;
    const recentSnapshots = this.history.filter(
      snapshot => snapshot.timestamp >= oneMinuteAgo
    );

    if (recentSnapshots.length < 2) {
      return { received: 0, sent: 0 };
    }

    const oldest = recentSnapshots[0];
    const newest = recentSnapshots[recentSnapshots.length - 1];
    const durationSeconds = (newest.timestamp - oldest.timestamp) / 1000;

    if (durationSeconds === 0) {
      return { received: 0, sent: 0 };
    }

    const receivedDelta = newest.messagesReceived - oldest.messagesReceived;
    const sentDelta = newest.messagesSent - oldest.messagesSent;

    return {
      received: Math.round(receivedDelta / durationSeconds),
      sent: Math.round(sentDelta / durationSeconds),
    };
  }
}
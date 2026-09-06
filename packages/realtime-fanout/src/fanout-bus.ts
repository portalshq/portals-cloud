export type FanoutHandler = (message: unknown) => void | Promise<void>;

export interface FanoutBus {
  publish(topic: string, message: unknown): Promise<void>;
  subscribe(topic: string, handler: FanoutHandler): Promise<() => void>;
}

export interface InMemoryFanoutBusOptions {
  /** Retain this many messages per topic for local diagnostics. Defaults to none. */
  historySize?: number;
  /** Receives subscriber exceptions without preventing other subscribers from receiving a message. */
  onSubscriberError?: (error: unknown, topic: string) => void;
}

/**
 * A process-local pub/sub bus for development and single-instance deployments.
 * It deliberately provides no durability or cross-process delivery.
 */
export class InMemoryFanoutBus implements FanoutBus {
  private readonly subscribers = new Map<string, Set<FanoutHandler>>();
  private readonly history = new Map<string, unknown[]>();
  private readonly historySize: number;
  private readonly onSubscriberError?: (error: unknown, topic: string) => void;

  constructor(options: InMemoryFanoutBusOptions = {}) {
    this.historySize = options.historySize ?? 0;
    if (!Number.isInteger(this.historySize) || this.historySize < 0) {
      throw new TypeError("historySize must be a non-negative integer");
    }
    this.onSubscriberError = options.onSubscriberError;
  }

  async publish(topic: string, message: unknown): Promise<void> {
    assertTopic(topic);
    this.remember(topic, message);
    const handlers = [...(this.subscribers.get(topic) ?? [])];
    const results = await Promise.allSettled(
      handlers.map((handler) => Promise.resolve().then(() => handler(message))),
    );
    for (const result of results) {
      if (result.status === "rejected") this.onSubscriberError?.(result.reason, topic);
    }
  }

  async subscribe(topic: string, handler: FanoutHandler): Promise<() => void> {
    assertTopic(topic);
    if (typeof handler !== "function") throw new TypeError("handler must be a function");

    const handlers = this.subscribers.get(topic) ?? new Set<FanoutHandler>();
    handlers.add(handler);
    this.subscribers.set(topic, handlers);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      handlers.delete(handler);
      if (handlers.size === 0) this.subscribers.delete(topic);
    };
  }

  getSubscriberCount(topic?: string): number {
    if (topic) {
      assertTopic(topic);
      return this.subscribers.get(topic)?.size ?? 0;
    }
    return [...this.subscribers.values()].reduce((count, handlers) => count + handlers.size, 0);
  }

  getHistory(topic: string): readonly unknown[] {
    assertTopic(topic);
    return [...(this.history.get(topic) ?? [])];
  }

  private remember(topic: string, message: unknown): void {
    if (this.historySize === 0) return;
    const history = this.history.get(topic) ?? [];
    history.push(message);
    if (history.length > this.historySize) history.shift();
    this.history.set(topic, history);
  }
}

function assertTopic(topic: string): void {
  if (!topic.trim()) throw new TypeError("topic is required");
}

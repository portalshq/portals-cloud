export type FanoutDeliveryClass = "reliable" | "snapshot";

export interface FanoutEnvelope<T = unknown> {
  topic: string;
  payload: T;
  delivery: FanoutDeliveryClass;
}

export interface FanoutConnection {
  id: string;
  send(message: string): void | Promise<void>;
  close?(code: number, reason: string): void;
}

export interface FanoutHubOptions {
  maxReliableQueue?: number;
  serialize?: (envelope: FanoutEnvelope) => string;
  onDeliveryError?: (error: unknown, connectionId: string) => void;
}

interface ConnectionState {
  connection: FanoutConnection;
  topics: Set<string>;
  reliable: FanoutEnvelope[];
  snapshots: Map<string, FanoutEnvelope>;
  flushing: boolean;
  disconnected: boolean;
}

/** Ordered, bounded fanout for WebSocket-like transports. */
export class FanoutHub {
  private readonly connections = new Map<string, ConnectionState>();
  private readonly maxReliableQueue: number;
  private readonly serialize: (envelope: FanoutEnvelope) => string;
  private readonly onDeliveryError?: (error: unknown, connectionId: string) => void;

  constructor(options: FanoutHubOptions = {}) {
    this.maxReliableQueue = options.maxReliableQueue ?? 100;
    if (!Number.isInteger(this.maxReliableQueue) || this.maxReliableQueue < 1) {
      throw new TypeError("maxReliableQueue must be a positive integer");
    }
    this.serialize = options.serialize ?? JSON.stringify;
    this.onDeliveryError = options.onDeliveryError;
  }

  register(connection: FanoutConnection): () => void {
    const id = connection.id.trim();
    if (!id) throw new TypeError("connection.id is required");
    if (this.connections.has(id)) throw new Error(`Connection ${id} is already registered`);
    const state: ConnectionState = {
      connection: { ...connection, id }, topics: new Set(), reliable: [], snapshots: new Map(),
      flushing: false, disconnected: false,
    };
    this.connections.set(id, state);
    return () => this.unregister(id);
  }

  unregister(connectionId: string): void {
    const state = this.connections.get(connectionId);
    if (!state) return;
    state.disconnected = true;
    state.reliable.length = 0;
    state.snapshots.clear();
    this.connections.delete(connectionId);
  }

  subscribe(connectionId: string, topic: string): () => void {
    const state = this.requireConnection(connectionId);
    const normalized = requiredTopic(topic);
    state.topics.add(normalized);
    return () => state.topics.delete(normalized);
  }

  publish<T>(topic: string, payload: T, delivery: FanoutDeliveryClass = "reliable"): void {
    const normalized = requiredTopic(topic);
    const envelope: FanoutEnvelope<T> = { topic: normalized, payload, delivery };
    for (const state of this.connections.values()) {
      if (!state.topics.has(normalized)) continue;
      this.enqueue(state, envelope);
    }
  }

  /** Enqueues a message for one connection through the same ordered path as topic fanout. */
  send<T>(connectionId: string, payload: T, delivery: FanoutDeliveryClass = "reliable"): boolean {
    const state = this.connections.get(connectionId);
    if (!state || state.disconnected) return false;
    this.enqueue(state, { topic: `connection:${connectionId}`, payload, delivery });
    return true;
  }

  connectionCount(topic?: string): number {
    if (!topic) return this.connections.size;
    const normalized = requiredTopic(topic);
    return [...this.connections.values()].filter((state) => state.topics.has(normalized)).length;
  }

  private enqueue(state: ConnectionState, envelope: FanoutEnvelope): void {
    if (envelope.delivery === "snapshot") {
      state.snapshots.set(envelope.topic, envelope);
    } else if (state.reliable.length >= this.maxReliableQueue) {
      state.connection.close?.(1013, "reliable fanout queue exhausted");
      this.unregister(state.connection.id);
      return;
    } else {
      state.reliable.push(envelope);
    }
    void this.flush(state);
  }

  private async flush(state: ConnectionState): Promise<void> {
    if (state.flushing || state.disconnected) return;
    state.flushing = true;
    try {
      while (!state.disconnected) {
        const envelope = state.reliable.shift() ?? takeFirst(state.snapshots);
        if (!envelope) return;
        try {
          await state.connection.send(this.serialize(envelope));
        } catch (error) {
          this.onDeliveryError?.(error, state.connection.id);
          state.connection.close?.(1011, "fanout delivery failed");
          this.unregister(state.connection.id);
          return;
        }
      }
    } finally {
      state.flushing = false;
      if (!state.disconnected && (state.reliable.length > 0 || state.snapshots.size > 0)) void this.flush(state);
    }
  }

  private requireConnection(id: string): ConnectionState {
    const state = this.connections.get(id);
    if (!state) throw new Error(`Unknown connection ${id}`);
    return state;
  }
}

function takeFirst(values: Map<string, FanoutEnvelope>): FanoutEnvelope | undefined {
  const first = values.entries().next();
  if (first.done) return undefined;
  values.delete(first.value[0]);
  return first.value[1];
}

function requiredTopic(topic: string): string {
  const normalized = topic.trim();
  if (!normalized) throw new TypeError("topic is required");
  return normalized;
}

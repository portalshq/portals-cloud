import { Registry, type Identity, type Observation, type Properties, type Sink } from "./index.js";
export interface IdentityStorage { get(): string | null; set(id: string): void; clear(): void }
export interface ClientOptions { registry: Registry; sink: Sink; collectionAllowed?: () => boolean; storage?: IdentityStorage; maxQueue?: number; batchSize?: number; onDrop?: (count: number) => void }
/** The application owns policy, identity verification, and adapter lifecycle. */
export class AnalyticsClient {
  private queue: Observation[] = [];
  private generation = 0;
  private flushing = false;
  private anonymousId?: string;
  private userId?: string;
  private readonly maxQueue: number;
  private readonly batchSize: number;
  constructor(private readonly options: ClientOptions) {
    this.maxQueue = options.maxQueue ?? 200;
    this.batchSize = options.batchSize ?? 20;
    if (!Number.isInteger(this.maxQueue) || this.maxQueue < 1 || !Number.isInteger(this.batchSize) || this.batchSize < 1) throw new Error("Invalid queue configuration");
  }
  private allowed(): boolean { return this.options.collectionAllowed?.() ?? true; }
  /** Drops retained observations and rotates identity as soon as collection is
   *  disallowed, instead of waiting for a later flush attempt. */
  private dropIfDisallowed(): boolean {
    if (this.allowed()) return false;
    this.generation++; this.queue = []; this.userId = undefined; this.anonymousId = undefined;
    this.options.storage?.clear();
    return true;
  }
  private identity(): Identity {
    if (!this.anonymousId) {
      this.anonymousId = this.options.storage?.get() || crypto.randomUUID();
      this.options.storage?.set(this.anonymousId);
    }
    return { anonymousId: this.anonymousId, ...(this.userId ? {userId: this.userId} : {}) };
  }
  /** Call only with a user ID obtained from the host's verified session. */
  async identify(userId: string): Promise<void> {
    if (this.dropIfDisallowed()) { await this.options.sink.reset?.(); return; }
    if (!userId || userId.length > 128 || userId.includes("@")) throw new Error("Expected opaque user ID");
    if (this.userId && this.userId !== userId) await this.reset();
    const generation = this.generation;
    const identity = { ...this.identity(), userId };
    await this.options.sink.identify?.(identity);
    if (this.generation === generation && this.allowed()) this.userId = userId;
  }
  /** Discard pending observations and rotate identity on logout, suppression or deletion. */
  async reset(): Promise<void> {
    this.generation++; this.queue = []; this.userId = undefined; this.anonymousId = undefined;
    this.options.storage?.clear();
    await this.options.sink.reset?.();
  }
  record(name: string, properties: Properties = {}): boolean {
    if (this.dropIfDisallowed()) return false;
    const definition = this.options.registry.validate(name, properties);
    if (this.queue.length >= this.maxQueue) { this.options.onDrop?.(1); return false; }
    this.queue.push({ id: crypto.randomUUID(), name, version: definition.version, occurredAt: new Date().toISOString(), provenance: "client", properties: { ...properties }, identity: this.identity() });
    return true;
  }
  async flush(): Promise<void> {
    if (this.dropIfDisallowed()) { await this.options.sink.reset?.(); return; }
    if (this.flushing || !this.queue.length) return;
    this.flushing = true;
    const generation = this.generation;
    const batch = this.queue.slice(0, this.batchSize);
    try {
      await this.options.sink.send(batch);
      if (generation === this.generation) this.queue.splice(0, batch.length);
    } finally { this.flushing = false; }
  }
  get pending(): number { return this.queue.length; }
}
export type WindowEnd = "completed" | "interrupted" | "timed_out" | "unknown";
export interface WindowResult { id: string; elapsedMs: number; activeMs: number; reason: WindowEnd }
export class ActivityWindow {
  private readonly started: number;
  private lastActive: number | undefined;
  private active = 0;
  private result?: WindowResult;
  constructor(readonly id: string, private readonly now: () => number = () => performance.now()) { this.started = now(); this.lastActive = this.started; }
  pause(): void { if (!this.result && this.lastActive !== undefined) { this.active += Math.max(0, this.now() - this.lastActive); this.lastActive = undefined; } }
  resume(): void { if (!this.result && this.lastActive === undefined) this.lastActive = this.now(); }
  end(reason: WindowEnd): WindowResult {
    if (this.result) return this.result;
    const end = this.now();
    if (this.lastActive !== undefined) this.active += Math.max(0, end - this.lastActive);
    return this.result = { id: this.id, elapsedMs: Math.max(0, end - this.started), activeMs: this.active, reason };
  }
}

/** Browser composition with bounded retries and a replaceable HTTP endpoint. */
export function createBrowserRecorder(options: Omit<ClientOptions, 'sink'> & {endpoint: string; retryMs?: number; fetch?: typeof fetch}) {
  const transport = options.fetch ?? globalThis.fetch;
  const client = new AnalyticsClient({...options, sink: {async send(events) {
    const response = await transport(options.endpoint, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({events}), keepalive: true});
    if (!response.ok) throw new Error(`Analytics delivery failed (${response.status})`);
  }}});
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const schedule = (delay = 0) => {
    if (timer || stopped) return;
    timer = setTimeout(async () => {
      timer = undefined;
      if (stopped || !client.pending) return;
      try { await client.flush(); } catch { schedule(options.retryMs ?? 10_000); return; }
      if (client.pending) schedule();
    }, delay);
  };
  return {
    client,
    record(name: string, properties: Properties = {}): boolean {
      const recorded = client.record(name, properties);
      if (recorded) schedule();
      return recorded;
    },
    async stop() { stopped = true; if (timer) clearTimeout(timer); await client.reset(); },
  };
}

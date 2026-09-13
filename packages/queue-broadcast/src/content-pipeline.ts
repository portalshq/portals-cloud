export type ContentQueueState =
  | "queued"
  | "preparing"
  | "prepared"
  | "staged"
  | "released"
  | "completed"
  | "terminal-failed"
  | "cancelled";

export interface ContentQueueIdentity {
  channelId: string;
  runEpoch: string;
  contentKey: string;
  ordinal: number;
}

export interface ContentCapacity {
  durationMs: number;
  bytes: number;
  contentCount: number;
  visualKey?: string;
}

export interface ContentQueueLimits {
  maxInFlight: number;
  maxDurationMs?: number;
  maxBytes?: number;
  maxContentCount?: number;
}

export interface ContentQueueObservation {
  identity: ContentQueueIdentity;
  state: ContentQueueState;
  sequence: number;
  error?: unknown;
}

export interface ContentQueuePipelineOptions<TRequest, TPrepared> {
  limits: ContentQueueLimits;
  identity(request: TRequest): ContentQueueIdentity;
  estimate(request: TRequest): ContentCapacity;
  measure(prepared: TPrepared, request: TRequest): ContentCapacity;
  prepare(request: TRequest, signal: AbortSignal): Promise<TPrepared>;
  /** Commits completions in enqueue order, even when preparation finishes out of order. */
  commit(
    observation: ContentQueueObservation,
    prepared: TPrepared | undefined,
    request: TRequest,
  ): Promise<void>;
  onObservation?: (observation: ContentQueueObservation) => void;
}

export interface ContentQueueTicket<TPrepared> {
  identity: ContentQueueIdentity;
  completion: Promise<TPrepared>;
}

interface WorkItem<TRequest, TPrepared> {
  sequence: number;
  key: string;
  identity: ContentQueueIdentity;
  request: TRequest;
  estimate: ContentCapacity;
  state: ContentQueueState;
  controller: AbortController;
  prepared?: TPrepared;
  actual?: ContentCapacity;
  error?: unknown;
  resolve(value: TPrepared): void;
  reject(error: unknown): void;
}

/** Bounded, ordered preparation for queue-broadcast producers. */
export class ContentQueuePipeline<TRequest, TPrepared> {
  private readonly work = new Map<string, WorkItem<TRequest, TPrepared>>();
  private readonly pending: WorkItem<TRequest, TPrepared>[] = [];
  private nextSequence = 1;
  private nextCommitSequence = 1;
  private active = 0;
  private committing = false;
  private stopped = false;

  constructor(private readonly options: ContentQueuePipelineOptions<TRequest, TPrepared>) {
    const { limits } = options;
    assertPositiveInteger("maxInFlight", limits.maxInFlight);
    assertOptionalLimit("maxDurationMs", limits.maxDurationMs);
    assertOptionalLimit("maxBytes", limits.maxBytes);
    assertOptionalLimit("maxContentCount", limits.maxContentCount);
  }

  enqueue(request: TRequest): ContentQueueTicket<TPrepared> {
    if (this.stopped) throw new Error("ContentQueuePipeline is stopped");
    const identity = normalizeIdentity(this.options.identity(request));
    const key = identityKey(identity);
    const existing = this.work.get(key);
    if (existing) return { identity: existing.identity, completion: itemCompletion(existing) };

    const estimate = normalizeCapacity(this.options.estimate(request));
    this.assertCapacity(estimate);
    let resolve!: (value: TPrepared) => void;
    let reject!: (error: unknown) => void;
    const completion = new Promise<TPrepared>((res, rej) => { resolve = res; reject = rej; });
    const item: WorkItem<TRequest, TPrepared> = {
      sequence: this.nextSequence++, key, identity, request, estimate, state: "queued",
      controller: new AbortController(), resolve, reject,
    };
    Object.defineProperty(item, "completion", { value: completion });
    this.work.set(key, item);
    this.pending.push(item);
    this.observe(item);
    this.drain();
    return { identity, completion };
  }

  /** Update queue lifecycle after preparation without creating another state owner. */
  acknowledge(identity: ContentQueueIdentity, state: Extract<ContentQueueState, "staged" | "released" | "completed">): void {
    const item = this.work.get(identityKey(normalizeIdentity(identity)));
    if (!item) throw new Error("Unknown content queue identity");
    const allowed = item.state === "prepared"
      ? state === "staged"
      : item.state === "staged"
        ? state === "released"
        : item.state === "released" && state === "completed";
    if (!allowed) throw new Error(`Invalid content queue transition ${item.state} -> ${state}`);
    item.state = state;
    this.observe(item);
  }

  snapshot(): readonly ContentQueueObservation[] {
    return [...this.work.values()].sort((a, b) => a.sequence - b.sequence).map((item) => this.toObservation(item));
  }

  capacity(): ContentCapacity {
    return capacityOf([...this.work.values()].filter((item) => !isTerminal(item.state)));
  }

  private capacityExcluding(excluded: WorkItem<TRequest, TPrepared>): ContentCapacity {
    return capacityOf([...this.work.values()].filter((item) => item !== excluded && !isTerminal(item.state)));
  }

  private assertMeasuredCapacity(item: WorkItem<TRequest, TPrepared>, candidate: ContentCapacity): void {
    this.assertCapacityAgainst(this.capacityExcluding(item), candidate, item);
  }

  private assertCapacityAgainst(
    current: ContentCapacity,
    candidate: ContentCapacity,
    excluded?: WorkItem<TRequest, TPrepared>,
  ): void {
    const sharesVisual = candidate.visualKey && [...this.work.values()].some((item) => {
      if (item === excluded || isTerminal(item.state)) return false;
      return (item.actual ?? item.estimate).visualKey === candidate.visualKey;
    });
    const bytes = current.bytes + (sharesVisual ? 0 : candidate.bytes);
    const { limits } = this.options;
    if (limits.maxDurationMs !== undefined && current.durationMs + candidate.durationMs > limits.maxDurationMs) throw capacityError("duration");
    if (limits.maxBytes !== undefined && bytes > limits.maxBytes) throw capacityError("bytes");
    if (limits.maxContentCount !== undefined && current.contentCount + candidate.contentCount > limits.maxContentCount) throw capacityError("content count");
  }

  async stop(reason: unknown = new Error("ContentQueuePipeline stopped")): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    for (const item of this.work.values()) {
      if (isTerminal(item.state)) continue;
      item.controller.abort(reason);
      if (item.state !== "preparing") {
        item.state = "cancelled";
        item.error = reason;
        this.observe(item);
      }
    }
    this.pending.length = 0;
    await this.commitReady();
    await Promise.allSettled([...this.work.values()].map((item) => itemCompletion(item)));
  }

  private assertCapacity(candidate: ContentCapacity): void {
    this.assertCapacityAgainst(this.capacity(), candidate);
  }

  private drain(): void {
    while (!this.stopped && this.active < this.options.limits.maxInFlight) {
      const item = this.pending.shift();
      if (!item) return;
      this.active += 1;
      item.state = "preparing";
      this.observe(item);
      void this.run(item);
    }
  }

  private async run(item: WorkItem<TRequest, TPrepared>): Promise<void> {
    try {
      const prepared = await this.options.prepare(item.request, item.controller.signal);
      if (item.controller.signal.aborted || this.stopped) throw item.controller.signal.reason ?? new Error("cancelled");
      const actual = normalizeCapacity(this.options.measure(prepared, item.request));
      this.assertMeasuredCapacity(item, actual);
      item.prepared = prepared;
      item.actual = actual;
      item.state = "prepared";
    } catch (error) {
      item.error = error;
      item.state = item.controller.signal.aborted || this.stopped ? "cancelled" : "terminal-failed";
    } finally {
      this.active -= 1;
      this.observe(item);
      await this.commitReady();
      this.drain();
    }
  }

  private async commitReady(): Promise<void> {
    if (this.committing) return;
    this.committing = true;
    try {
      while (true) {
        const item = [...this.work.values()].find((candidate) => candidate.sequence === this.nextCommitSequence);
        if (!item || !["prepared", "terminal-failed", "cancelled"].includes(item.state)) return;
        const observation = this.toObservation(item);
        try {
          await this.options.commit(observation, item.prepared, item.request);
          if (item.state === "prepared") item.resolve(item.prepared as TPrepared);
          else item.reject(item.error);
          this.nextCommitSequence += 1;
        } catch (error) {
          item.error = error;
          item.state = "terminal-failed";
          this.observe(item);
          item.reject(error);
          this.nextCommitSequence += 1;
        }
      }
    } finally {
      this.committing = false;
      const next = [...this.work.values()].find((candidate) => candidate.sequence === this.nextCommitSequence);
      if (next && ["prepared", "terminal-failed", "cancelled"].includes(next.state)) void this.commitReady();
    }
  }

  private observe(item: WorkItem<TRequest, TPrepared>): void {
    this.options.onObservation?.(this.toObservation(item));
  }

  private toObservation(item: WorkItem<TRequest, TPrepared>): ContentQueueObservation {
    return { identity: item.identity, state: item.state, sequence: item.sequence, ...(item.error === undefined ? {} : { error: item.error }) };
  }
}

function capacityOf<TRequest, TPrepared>(current: WorkItem<TRequest, TPrepared>[]): ContentCapacity {
  const visualKeys = new Set<string>();
  return current.reduce<ContentCapacity>((total, item) => {
    const measure = item.actual ?? item.estimate;
    const countVisual = !measure.visualKey || !visualKeys.has(measure.visualKey);
    if (measure.visualKey) visualKeys.add(measure.visualKey);
    total.durationMs += measure.durationMs;
    total.bytes += countVisual ? measure.bytes : 0;
    total.contentCount += measure.contentCount;
    return total;
  }, { durationMs: 0, bytes: 0, contentCount: 0 });
}

function itemCompletion<TRequest, TPrepared>(item: WorkItem<TRequest, TPrepared>): Promise<TPrepared> {
  return (item as WorkItem<TRequest, TPrepared> & { completion: Promise<TPrepared> }).completion;
}

function normalizeIdentity(identity: ContentQueueIdentity): ContentQueueIdentity {
  const result = { ...identity, channelId: identity.channelId.trim(), runEpoch: identity.runEpoch.trim(), contentKey: identity.contentKey.trim() };
  if (!result.channelId || !result.runEpoch || !result.contentKey) throw new TypeError("content identity fields are required");
  if (!Number.isInteger(result.ordinal) || result.ordinal < 0) throw new TypeError("ordinal must be a non-negative integer");
  return result;
}

function identityKey(identity: ContentQueueIdentity): string {
  return JSON.stringify([identity.channelId, identity.runEpoch, identity.contentKey, identity.ordinal]);
}

function normalizeCapacity(value: ContentCapacity): ContentCapacity {
  for (const [name, amount] of Object.entries({ durationMs: value.durationMs, bytes: value.bytes, contentCount: value.contentCount })) {
    if (!Number.isFinite(amount) || amount < 0) throw new TypeError(`${name} must be non-negative`);
  }
  if (!Number.isInteger(value.contentCount)) throw new TypeError("contentCount must be an integer");
  return { ...value, visualKey: value.visualKey?.trim() || undefined };
}

function isTerminal(state: ContentQueueState): boolean {
  return state === "completed" || state === "terminal-failed" || state === "cancelled";
}

function capacityError(kind: string): Error {
  const error = new Error(`Content queue ${kind} capacity exceeded`);
  error.name = "ContentQueueCapacityError";
  return error;
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer`);
}

function assertOptionalLimit(name: string, value: number | undefined): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new TypeError(`${name} must be non-negative`);
}

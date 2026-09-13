export interface DeliveryCandidate {
  id: string;
  kind: "canonical" | "ambient" | (string & {});
  eligibleAt: Date;
  expiresAt?: Date;
  estimatedDurationMs: number;
  priority: number;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface DeliveryScheduleContext {
  now: Date;
  sessionId: string;
  isHealthy: boolean;
  lastReleased?: DeliveryCandidate;
}

export interface LiveProgrammingPolicy {
  nextCandidates(context: DeliveryScheduleContext): Promise<readonly DeliveryCandidate[]>;
  canRelease(candidate: DeliveryCandidate, context: DeliveryScheduleContext): boolean;
}

export interface LiveReleaseAdapter {
  release(candidate: DeliveryCandidate, signal: AbortSignal): Promise<void>;
}

export interface LiveProgrammingOptions {
  policy: LiveProgrammingPolicy;
  release: LiveReleaseAdapter;
  intervalMs?: number;
  now?: () => Date;
  onError?: (error: unknown) => void;
  onReleased?: (candidate: DeliveryCandidate) => void;
}

/** Single-flight scheduler used by LiveDelivery after manifest health is established. */
export class LiveProgrammingScheduler {
  private readonly intervalMs: number;
  private readonly now: () => Date;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private controller: AbortController | undefined;
  private tickPromise: Promise<void> | undefined;
  private running = false;
  private lastReleased: DeliveryCandidate | undefined;
  private released = new Set<string>();

  constructor(
    private readonly sessionId: string,
    private readonly options: LiveProgrammingOptions,
    private readonly healthy: () => boolean,
  ) {
    this.intervalMs = options.intervalMs ?? 1_000;
    if (!Number.isInteger(this.intervalMs) || this.intervalMs < 1) throw new TypeError("programming intervalMs must be positive");
    this.now = options.now ?? (() => new Date());
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule(0);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.controller?.abort(new Error("Live programming stopped"));
    this.controller = undefined;
    await this.tickPromise;
  }

  private schedule(delay: number): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const pending = this.tick();
      this.tickPromise = pending;
      void pending.finally(() => {
        if (this.tickPromise === pending) this.tickPromise = undefined;
      });
    }, delay);
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    if (!this.running) return;
    try {
      const now = this.now();
      const context: DeliveryScheduleContext = {
        now, sessionId: this.sessionId, isHealthy: this.healthy(),
        ...(this.lastReleased ? { lastReleased: this.lastReleased } : {}),
      };
      if (context.isHealthy) {
        const candidates = [...await this.options.policy.nextCandidates(context)]
          .map(normalizeCandidate)
          .filter((candidate) => !this.released.has(candidate.id))
          .filter((candidate) => candidate.eligibleAt.getTime() <= now.getTime())
          .filter((candidate) => !candidate.expiresAt || candidate.expiresAt.getTime() > now.getTime())
          .filter((candidate) => this.options.policy.canRelease(candidate, context))
          .sort((a, b) => b.priority - a.priority || a.eligibleAt.getTime() - b.eligibleAt.getTime());
        const candidate = candidates[0];
        if (candidate) {
          const controller = new AbortController();
          this.controller = controller;
          await this.options.release.release(candidate, controller.signal);
          if (!controller.signal.aborted) {
            this.released.add(candidate.id);
            this.lastReleased = candidate;
            this.options.onReleased?.(candidate);
          }
          if (this.controller === controller) this.controller = undefined;
        }
      }
    } catch (error) {
      if (this.running) this.options.onError?.(error);
    } finally {
      this.schedule(this.intervalMs);
    }
  }
}

function normalizeCandidate(candidate: DeliveryCandidate): DeliveryCandidate {
  const id = candidate.id.trim();
  if (!id) throw new TypeError("delivery candidate id is required");
  if (!Number.isFinite(candidate.eligibleAt.getTime())) throw new TypeError("eligibleAt must be valid");
  if (candidate.expiresAt && !Number.isFinite(candidate.expiresAt.getTime())) throw new TypeError("expiresAt must be valid");
  if (!Number.isFinite(candidate.estimatedDurationMs) || candidate.estimatedDurationMs < 0) throw new TypeError("estimatedDurationMs must be non-negative");
  if (!Number.isFinite(candidate.priority)) throw new TypeError("priority must be finite");
  return { ...candidate, id };
}

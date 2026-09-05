/**
 * Channel-agnostic, presence-triggered realtime engine.
 *
 * Replaces a global "iterate every channel every second" loop with one
 * timer per channel that is ONLY running while that channel is live.
 * Channels with nothing happening cost nothing -- no timer, no DB query,
 * no memory beyond a Set entry.
 *
 * Lifecycle (the "lazy-start" model):
 *   1. A channel has zero viewers and no timer. It costs nothing.
 *   2. The first viewer connects -> `onActivate(channelId)` is called once.
 *      Implementations should check: is a session due/already active for
 *      this channel? If yes, start it (if needed) and return `true`. If
 *      nothing is due yet but something is scheduled later, return
 *      `{ scheduleRecheckAt }` with that timestamp -- the engine will set
 *      a single precise timer to re-check at exactly that moment instead
 *      of polling. If nothing is scheduled at all, return `false`.
 *   3. Once running, the channel's session keeps advancing on its own
 *      schedule via `onTick`, called every `tickIntervalMs`, REGARDLESS
 *      of whether viewers come or go in the meantime. This is intentional:
 *      once live, it behaves like a broadcast, not an on-demand stream, so
 *      a later viewer always joins a consistent, in-progress state instead
 *      of triggering a confusing restart or needing catch-up logic.
 *   4. `onTick` returns `{ continue: false }` when the session has reached
 *      its natural end. The engine then stops the timer and the channel
 *      goes back to step 1 (dormant) until the next viewer triggers a
 *      fresh `onActivate` check.
 *
 * This package has no knowledge of your schema, your AI generation calls,
 * or your database -- all of that is injected via the options callbacks,
 * so it stays reusable across any "channel" product, not just one app.
 */

export type ActivationResult = boolean | { scheduleRecheckAt: number };

export interface TickResult {
  /** false once the session has reached its natural end; the engine stops ticking. */
  continue: boolean;
}

export interface RealtimeEngineOptions {
  /**
   * Called when a channel transitions from zero viewers to its first
   * viewer. Implementations should check / perform the lazy-start logic.
   * Must not throw for "nothing due" -- return `false` or a recheck time
   * instead; only throw for genuine errors (which the engine logs and
   * treats as "do not start").
   */
  onActivate: (channelId: string) => Promise<ActivationResult>;

  /**
   * Called roughly every `tickIntervalMs` while a channel's loop is
   * running. Should be cheap in the common (no-transition) case --
   * compute remaining time from cached state and broadcast a heartbeat.
   * Only do heavier work (content generation, DB writes) when an actual
   * phase transition is due.
   */
  onTick: (channelId: string) => Promise<TickResult>;

  /** Called when a channel's session ends and its timer stops. */
  onDeactivate?: (channelId: string) => Promise<void>;

  /** Default 1000ms. */
  tickIntervalMs?: number;

  /** Injected for testability; defaults to console. */
  logger?: Pick<Console, "error" | "warn">;
}

export class RealtimeEngine {
  private viewers = new Map<string, Set<string>>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private recheckTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private recheckRequiresViewer = new Map<string, boolean>();
  private activating = new Set<string>();
  private activationEpoch = new Map<string, number>();
  private deactivating = new Map<string, Promise<void>>();
  private readonly tickIntervalMs: number;
  private readonly logger: Pick<Console, "error" | "warn">;

  constructor(private readonly opts: RealtimeEngineOptions) {
    this.tickIntervalMs = opts.tickIntervalMs ?? 1000;
    this.logger = opts.logger ?? console;
  }

  /** Call when a viewer (WS connection) subscribes to a channel. */
  async addViewer(channelId: string, connectionId: string): Promise<void> {
    assertIdentifier("channelId", channelId);
    assertIdentifier("connectionId", connectionId);
    let set = this.viewers.get(channelId);
    if (!set) {
      set = new Set();
      this.viewers.set(channelId, set);
    }
    set.add(connectionId);

    if (
      this.timers.has(channelId)
      || this.recheckTimers.has(channelId)
      || this.activating.has(channelId)
    ) return;

    await this.activateChannel(channelId, true);
  }

  /** Call when a viewer (WS connection) disconnects / unsubscribes. */
  removeViewer(channelId: string, connectionId: string): void {
    const set = this.viewers.get(channelId);
    if (!set) return;
    set.delete(connectionId);
    if (set.size > 0) return;

    this.viewers.delete(channelId);

    if (!this.timers.has(channelId) && this.recheckRequiresViewer.get(channelId)) {
      const pending = this.recheckTimers.get(channelId);
      if (pending) clearTimeout(pending);
      this.recheckTimers.delete(channelId);
      this.recheckRequiresViewer.delete(channelId);
    }
  }

  /** Activate a channel without requiring a connected viewer. */
  async ensureActive(channelId: string): Promise<void> {
    assertIdentifier("channelId", channelId);
    if (
      this.timers.has(channelId)
      || this.recheckTimers.has(channelId)
      || this.activating.has(channelId)
    ) return;
    await this.activateChannel(channelId, false);
  }

  viewerCount(channelId: string): number {
    return this.viewers.get(channelId)?.size ?? 0;
  }

  isRunning(channelId: string): boolean {
    return this.timers.has(channelId);
  }

  /** Channels currently ticking (i.e. a live session in progress). */
  runningChannelIds(): string[] {
    return [...this.timers.keys()];
  }

  /** Stop one channel and wait for its deactivation callback. */
  async stop(channelId: string): Promise<void> {
    assertIdentifier("channelId", channelId);
    this.activationEpoch.set(channelId, (this.activationEpoch.get(channelId) ?? 0) + 1);

    const timer = this.timers.get(channelId);
    if (timer) clearTimeout(timer);
    this.timers.delete(channelId);

    const recheck = this.recheckTimers.get(channelId);
    if (recheck) clearTimeout(recheck);
    this.recheckTimers.delete(channelId);
    this.recheckRequiresViewer.delete(channelId);

    const existing = this.deactivating.get(channelId);
    if (existing) return existing;
    if (!timer && !recheck) return;

    const deactivation = Promise.resolve(this.opts.onDeactivate?.(channelId))
      .catch((err) => {
        this.logger.error(`[realtime-engine] onDeactivate failed for ${channelId}`, err);
      })
      .finally(() => {
        this.deactivating.delete(channelId);
      });
    this.deactivating.set(channelId, deactivation);
    return deactivation;
  }

  /** Backward-compatible fire-and-forget shutdown. */
  stopAll(): void {
    for (const channelId of this.activeChannelIds()) void this.stop(channelId);
  }

  /** Stop every channel and await all deactivation callbacks. */
  async shutdown(): Promise<void> {
    await Promise.all([...this.activeChannelIds()].map((channelId) => this.stop(channelId)));
    await Promise.all(this.deactivating.values());
  }

  private activeChannelIds(): Set<string> {
    return new Set([
      ...this.timers.keys(),
      ...this.recheckTimers.keys(),
      ...this.activating,
    ]);
  }

  private async activateChannel(channelId: string, requireViewer: boolean): Promise<void> {
    if (this.activating.has(channelId) || this.timers.has(channelId)) return;
    const epoch = this.activationEpoch.get(channelId) ?? 0;
    this.activating.add(channelId);
    try {
      const result = await this.opts.onActivate(channelId);

      if ((this.activationEpoch.get(channelId) ?? 0) !== epoch) return;
      if (requireViewer && this.viewerCount(channelId) === 0) return;

      if (result === true) {
        this.startTimer(channelId);
        return;
      }

      if (result && typeof result === "object") {
        this.scheduleRecheck(channelId, result.scheduleRecheckAt, requireViewer);
      }
    } catch (err) {
      this.logger.error(`[realtime-engine] onActivate failed for ${channelId}`, err);
    } finally {
      this.activating.delete(channelId);
    }
  }

  private scheduleRecheck(channelId: string, at: number, requireViewer: boolean): void {
    const existing = this.recheckTimers.get(channelId);
    if (existing) clearTimeout(existing);

    const delay = Math.max(0, at - Date.now());
    const timer = setTimeout(() => {
      this.recheckTimers.delete(channelId);
      this.recheckRequiresViewer.delete(channelId);
      if ((!requireViewer || this.viewerCount(channelId) > 0) && !this.timers.has(channelId)) {
        void this.activateChannel(channelId, requireViewer);
      }
    }, delay);
    this.recheckTimers.set(channelId, timer);
    this.recheckRequiresViewer.set(channelId, requireViewer);
  }

  private startTimer(channelId: string): void {
    if (this.timers.has(channelId)) return;
    this.scheduleTick(channelId);
  }

  private scheduleTick(channelId: string): void {
    const timer = setTimeout(async () => {
      if (this.timers.get(channelId) !== timer) return;
      try {
        const result = await this.opts.onTick(channelId);
        if (!result.continue) {
          await this.stop(channelId);
          return;
        }
      } catch (err) {
        this.logger.error(`[realtime-engine] tick failed for ${channelId}`, err);
      }
      if (this.timers.get(channelId) === timer) this.scheduleTick(channelId);
    }, this.tickIntervalMs);
    this.timers.set(channelId, timer);
  }
}

function assertIdentifier(name: string, value: string): void {
  if (!value.trim()) throw new TypeError(`${name} is required`);
}

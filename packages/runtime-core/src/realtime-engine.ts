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
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private recheckTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private activating = new Set<string>();
  private readonly tickIntervalMs: number;
  private readonly logger: Pick<Console, "error" | "warn">;

  constructor(private readonly opts: RealtimeEngineOptions) {
    this.tickIntervalMs = opts.tickIntervalMs ?? 1000;
    this.logger = opts.logger ?? console;
  }

  /** Call when a viewer (WS connection) subscribes to a channel. */
  async addViewer(channelId: string, connectionId: string): Promise<void> {
    let set = this.viewers.get(channelId);
    if (!set) {
      set = new Set();
      this.viewers.set(channelId, set);
    }
    set.add(connectionId);

    // Already ticking, or already in the middle of an activation check
    // triggered by a different viewer arriving in the same instant.
    if (this.timers.has(channelId) || this.activating.has(channelId)) return;

    await this.activateChannel(channelId);
  }

  /** Call when a viewer (WS connection) disconnects / unsubscribes. */
  removeViewer(channelId: string, connectionId: string): void {
    const set = this.viewers.get(channelId);
    if (!set) return;
    set.delete(connectionId);
    if (set.size > 0) return;

    this.viewers.delete(channelId);

    // Deliberately NOT stopping an in-progress session's timer here.
    // See module doc: once live, a session runs on schedule regardless
    // of viewer presence. But if we were only *waiting* for a future
    // scheduled start (a pending recheck, no timer yet), there's no
    // reason to keep that pending wake-up alive for an empty room.
    if (!this.timers.has(channelId)) {
      const pending = this.recheckTimers.get(channelId);
      if (pending) {
        clearTimeout(pending);
        this.recheckTimers.delete(channelId);
      }
    }
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

  /** For graceful shutdown / tests. */
  stopAll(): void {
    for (const timer of this.timers.values()) clearInterval(timer);
    for (const timer of this.recheckTimers.values()) clearTimeout(timer);
    this.timers.clear();
    this.recheckTimers.clear();
  }

  private async activateChannel(channelId: string): Promise<void> {
    this.activating.add(channelId);
    try {
      const result = await this.opts.onActivate(channelId);

      // A viewer may have disconnected while the (async) check was in
      // flight. If the channel is now empty, don't bother starting a
      // timer or scheduling a recheck for an empty room.
      if (this.viewerCount(channelId) === 0) return;

      if (result === true) {
        this.startTimer(channelId);
        return;
      }

      if (result && typeof result === "object") {
        this.scheduleRecheck(channelId, result.scheduleRecheckAt);
      }
      // result === false: nothing scheduled at all; stay dormant. The
      // next new viewer connecting later will trigger another check.
    } catch (err) {
      this.logger.error(`[realtime-engine] onActivate failed for ${channelId}`, err);
    } finally {
      this.activating.delete(channelId);
    }
  }

  private scheduleRecheck(channelId: string, at: number): void {
    const existing = this.recheckTimers.get(channelId);
    if (existing) clearTimeout(existing);

    const delay = Math.max(0, at - Date.now());
    const timer = setTimeout(() => {
      this.recheckTimers.delete(channelId);
      if (this.viewerCount(channelId) > 0 && !this.timers.has(channelId)) {
        void this.activateChannel(channelId);
      }
    }, delay);
    this.recheckTimers.set(channelId, timer);
  }

  private startTimer(channelId: string): void {
    if (this.timers.has(channelId)) return;
    const timer = setInterval(() => {
      this.opts
        .onTick(channelId)
        .then((result) => {
          if (!result.continue) this.stopChannel(channelId);
        })
        .catch((err) => {
          this.logger.error(`[realtime-engine] tick failed for ${channelId}`, err);
        });
    }, this.tickIntervalMs);
    this.timers.set(channelId, timer);
  }

  private stopChannel(channelId: string): void {
    const timer = this.timers.get(channelId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(channelId);
    }
    this.opts.onDeactivate?.(channelId).catch((err) => {
      this.logger.error(`[realtime-engine] onDeactivate failed for ${channelId}`, err);
    });
  }
}

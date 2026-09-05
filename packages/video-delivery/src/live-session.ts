import { normalizeCaptionTracks, type CaptionTrack } from "./captions.js";

/** A token-free HLS source that an application can hand to its player. */
export interface HlsPlaybackSession {
  sessionId: string;
  playbackManifestUrl: string;
  /** Optional application-owned sidecar WebVTT tracks for the viewer. */
  captionTracks?: readonly CaptionTrack[];
}

export interface LiveDeliveryOptions extends HlsPlaybackSession {
  /** Number of immediate connection attempts before start fails. */
  retryAttempts?: number;
  /** Delay between connection attempts. */
  retryDelayMs?: number;
  /** Recheck the configured manifest while the delivery is active. */
  healthCheckIntervalMs?: number;
  /** Abort an individual manifest request after this duration. Defaults to 10 seconds. */
  requestTimeoutMs?: number;
  /** Injectable for non-browser server runtimes and tests. */
  fetch?: typeof fetch;
}

export interface LiveDeliveryStatus extends HlsPlaybackSession {
  isRunning: boolean;
  isHealthy: boolean;
  lastCheckedAt?: string;
  lastError?: string;
}

/**
 * Connects one configured HLS playback stream. It never provisions an origin,
 * schedules programming, or distinguishes live from on-demand business flows.
 */
export class LiveDelivery {
  private readonly session: HlsPlaybackSession;
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;
  private readonly healthCheckIntervalMs: number;
  private readonly requestTimeoutMs: number;
  private readonly requestFetch: typeof fetch;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private startPromise: Promise<HlsPlaybackSession> | null = null;
  private activeRequest: AbortController | null = null;
  private lifecycleGeneration = 0;
  private isRunning = false;
  private isHealthy = false;
  private lastCheckedAt: string | undefined;
  private lastError: string | undefined;

  constructor(options: LiveDeliveryOptions) {
    this.session = {
      sessionId: assertSessionId(options.sessionId),
      playbackManifestUrl: normalizeManifestUrl(options.playbackManifestUrl),
      ...(options.captionTracks === undefined
        ? {}
        : { captionTracks: normalizeCaptionTracks(options.captionTracks) }),
    };
    this.retryAttempts = options.retryAttempts ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 1_000;
    this.healthCheckIntervalMs = options.healthCheckIntervalMs ?? 30_000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.requestFetch = options.fetch ?? fetch;
    assertPositiveInteger("retryAttempts", this.retryAttempts);
    assertNonNegativeInteger("retryDelayMs", this.retryDelayMs);
    assertPositiveInteger("healthCheckIntervalMs", this.healthCheckIntervalMs);
    assertPositiveInteger("requestTimeoutMs", this.requestTimeoutMs);
  }

  async start(): Promise<HlsPlaybackSession> {
    if (this.isRunning) return this.session;
    if (!this.startPromise) {
      const generation = ++this.lifecycleGeneration;
      this.startPromise = this.connect(generation);
    }
    const pendingStart = this.startPromise;
    try {
      return await pendingStart;
    } finally {
      if (this.startPromise === pendingStart) this.startPromise = null;
    }
  }

  async stop(): Promise<void> {
    this.lifecycleGeneration += 1;
    this.isRunning = false;
    this.isHealthy = false;
    this.activeRequest?.abort(new Error("LiveDelivery stopped"));
    this.activeRequest = null;
    this.startPromise = null;
    if (this.healthCheckTimer) clearTimeout(this.healthCheckTimer);
    this.healthCheckTimer = null;
  }

  getStatus(): LiveDeliveryStatus {
    return {
      ...this.session,
      isRunning: this.isRunning,
      isHealthy: this.isHealthy,
      ...(this.lastCheckedAt ? { lastCheckedAt: this.lastCheckedAt } : {}),
      ...(this.lastError ? { lastError: this.lastError } : {}),
    };
  }

  private async connect(generation: number): Promise<HlsPlaybackSession> {
    await this.checkHealthWithRetry(generation);
    this.assertCurrent(generation);
    this.isRunning = true;
    this.scheduleHealthCheck(generation);
    return this.session;
  }

  private scheduleHealthCheck(generation: number): void {
    if (!this.isRunning || generation !== this.lifecycleGeneration) return;
    if (this.healthCheckTimer) clearTimeout(this.healthCheckTimer);
    this.healthCheckTimer = setTimeout(() => {
      this.healthCheckTimer = null;
      void this.refreshHealth(generation);
    }, this.healthCheckIntervalMs);
    this.healthCheckTimer.unref?.();
  }

  private async refreshHealth(generation: number): Promise<void> {
    try {
      await this.checkHealthWithRetry(generation);
    } catch {
      // The status records the error; an intermittent check must not crash the host process.
    } finally {
      this.scheduleHealthCheck(generation);
    }
  }

  private async checkHealthWithRetry(generation: number): Promise<void> {
    let error: unknown;
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      this.assertCurrent(generation);
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(new Error(`manifest request timed out after ${this.requestTimeoutMs}ms`)),
        this.requestTimeoutMs,
      );
      timeout.unref?.();
      this.activeRequest = controller;
      try {
        const response = await this.requestFetch(this.session.playbackManifestUrl, {
          method: "GET",
          headers: { Accept: "application/vnd.apple.mpegurl, application/x-mpegURL" },
          signal: controller.signal,
        });
        this.assertCurrent(generation);
        if (!response.ok) throw new Error(`manifest returned HTTP ${response.status}`);
        this.isHealthy = true;
        this.lastError = undefined;
        this.lastCheckedAt = new Date().toISOString();
        return;
      } catch (caught) {
        this.assertCurrent(generation);
        error = caught;
        if (attempt < this.retryAttempts) {
          await wait(this.retryDelayMs);
          this.assertCurrent(generation);
        }
      } finally {
        clearTimeout(timeout);
        if (this.activeRequest === controller) this.activeRequest = null;
      }
    }

    this.isHealthy = false;
    this.lastCheckedAt = new Date().toISOString();
    this.lastError = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to connect to configured stream: ${this.lastError}`, { cause: error });
  }

  private assertCurrent(generation: number): void {
    if (generation !== this.lifecycleGeneration) {
      throw new Error("LiveDelivery operation was stopped");
    }
  }
}

function assertSessionId(sessionId: string): string {
  const normalized = sessionId.trim();
  if (!normalized) throw new TypeError("sessionId is required");
  return normalized;
}

function normalizeManifestUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("playbackManifestUrl must use http or https");
  }
  if (url.username || url.password || url.hash) {
    throw new TypeError("playbackManifestUrl cannot include credentials or a fragment");
  }
  return url.toString();
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer`);
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative integer`);
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

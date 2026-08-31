/** A token-free HLS source that an application can hand to its player. */
export interface HlsPlaybackSession {
  sessionId: string;
  playbackManifestUrl: string;
}

export interface LiveDeliveryOptions extends HlsPlaybackSession {
  /** Number of immediate connection attempts before start fails. */
  retryAttempts?: number;
  /** Delay between connection attempts. */
  retryDelayMs?: number;
  /** Recheck the configured manifest while the delivery is active. */
  healthCheckIntervalMs?: number;
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
  private readonly requestFetch: typeof fetch;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private startPromise: Promise<HlsPlaybackSession> | null = null;
  private isRunning = false;
  private isHealthy = false;
  private lastCheckedAt: string | undefined;
  private lastError: string | undefined;

  constructor(options: LiveDeliveryOptions) {
    this.session = {
      sessionId: assertSessionId(options.sessionId),
      playbackManifestUrl: normalizeManifestUrl(options.playbackManifestUrl),
    };
    this.retryAttempts = options.retryAttempts ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 1_000;
    this.healthCheckIntervalMs = options.healthCheckIntervalMs ?? 30_000;
    this.requestFetch = options.fetch ?? fetch;
    assertPositiveInteger("retryAttempts", this.retryAttempts);
    assertNonNegativeInteger("retryDelayMs", this.retryDelayMs);
    assertPositiveInteger("healthCheckIntervalMs", this.healthCheckIntervalMs);
  }

  async start(): Promise<HlsPlaybackSession> {
    if (this.isRunning) return this.session;
    this.startPromise ??= this.connect();
    try {
      return await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.isHealthy = false;
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
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

  private async connect(): Promise<HlsPlaybackSession> {
    await this.checkHealthWithRetry();
    this.isRunning = true;
    this.startHealthMonitoring();
    return this.session;
  }

  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(() => {
      void this.refreshHealth();
    }, this.healthCheckIntervalMs);
    this.healthCheckTimer.unref?.();
  }

  private async refreshHealth(): Promise<void> {
    try {
      await this.checkHealthWithRetry();
    } catch {
      // The status records the error; an intermittent check must not crash the host process.
    }
  }

  private async checkHealthWithRetry(): Promise<void> {
    let error: unknown;
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await this.requestFetch(this.session.playbackManifestUrl, {
          method: "GET",
          headers: { Accept: "application/vnd.apple.mpegurl, application/x-mpegURL" },
        });
        if (!response.ok) throw new Error(`manifest returned HTTP ${response.status}`);
        this.isHealthy = true;
        this.lastError = undefined;
        this.lastCheckedAt = new Date().toISOString();
        return;
      } catch (caught) {
        error = caught;
        if (attempt < this.retryAttempts) await wait(this.retryDelayMs);
      }
    }

    this.isHealthy = false;
    this.lastCheckedAt = new Date().toISOString();
    this.lastError = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to connect to configured stream: ${this.lastError}`, { cause: error });
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

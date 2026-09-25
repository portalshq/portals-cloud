import type { HlsPlaybackSession } from "./live-session.js";

export type PlaybackState = "idle" | "loading" | "playing" | "buffering" | "reconnecting" | "error" | "destroyed";

export interface PlaybackObservation {
  state: PlaybackState;
  attempt: number;
  error?: unknown;
}

interface HlsLike {
  loadSource(source: string): void;
  attachMedia(media: HTMLMediaElement): void;
  startLoad?(): void;
  recoverMediaError?(): void;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  destroy(): void;
}

interface HlsConstructor {
  new(config?: Record<string, unknown>): HlsLike;
  isSupported(): boolean;
  Events?: { ERROR?: string };
  ErrorTypes?: { NETWORK_ERROR?: string; MEDIA_ERROR?: string };
}

export interface HlsPlaybackControllerOptions {
  media: HTMLMediaElement;
  session: Pick<HlsPlaybackSession, "playbackManifestUrl">;
  maxReconnectAttempts?: number;
  reconnectDelayMs?: number;
  hlsConfig?: Record<string, unknown>;
  loadHls?: () => Promise<HlsConstructor>;
  onObservation?: (observation: PlaybackObservation) => void;
}

/** Owns native HLS/hls.js attachment and bounded recovery for one media element. */
export class HlsPlaybackController {
  private hls: HlsLike | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private attempts = 0;
  private destroyed = false;
  private readonly maxAttempts: number;
  private readonly delayMs: number;
  private readonly loadHls: () => Promise<HlsConstructor>;

  constructor(private readonly options: HlsPlaybackControllerOptions) {
    this.maxAttempts = options.maxReconnectAttempts ?? 5;
    this.delayMs = options.reconnectDelayMs ?? 2_000;
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 0) throw new TypeError("maxReconnectAttempts must be non-negative");
    if (!Number.isInteger(this.delayMs) || this.delayMs < 0) throw new TypeError("reconnectDelayMs must be non-negative");
    this.loadHls = options.loadHls ?? defaultHlsLoader;
  }

  async attach(): Promise<void> {
    if (this.destroyed) throw new Error("HlsPlaybackController is destroyed");
    const generation = ++this.generation;
    this.cleanupSource();
    this.observe("loading");
    const { media } = this.options;
    if (media.canPlayType("application/vnd.apple.mpegurl")) {
      media.src = this.options.session.playbackManifestUrl;
      media.load();
      this.bindNative(generation);
      return;
    }
    const Hls = await this.loadHls();
    if (generation !== this.generation || this.destroyed) return;
    if (!Hls.isSupported()) throw new Error("HLS playback is not supported by this browser");
    const hls = new Hls(this.options.hlsConfig);
    this.hls = hls;
    hls.on?.(Hls.Events?.ERROR ?? "hlsError", (...args) => {
      const data = args.at(-1) as { fatal?: boolean; type?: string } | undefined;
      if (!data?.fatal) return;
      if (data.type === Hls.ErrorTypes?.MEDIA_ERROR) {
        hls.recoverMediaError?.();
        return;
      }
      if (data.type === Hls.ErrorTypes?.NETWORK_ERROR) hls.startLoad?.();
      this.reconnect(data);
    });
    hls.loadSource(this.options.session.playbackManifestUrl);
    hls.attachMedia(media);
    this.bindNative(generation);
  }

  async replace(session: Pick<HlsPlaybackSession, "playbackManifestUrl">): Promise<void> {
    (this.options as HlsPlaybackControllerOptions).session = session;
    this.attempts = 0;
    await this.attach();
  }

  reconnect(error?: unknown): void {
    if (this.destroyed || this.timer) return;
    if (this.attempts >= this.maxAttempts) {
      this.observe("error", error);
      return;
    }
    this.attempts += 1;
    this.observe("reconnecting", error);
    const delay = this.delayMs * Math.max(1, 2 ** (this.attempts - 1));
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.attach().catch((caught) => this.reconnect(caught));
    }, delay);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.cleanupSource();
    this.observe("destroyed");
  }

  private bindNative(generation: number): void {
    const { media } = this.options;
    const guard = (callback: () => void) => () => {
      if (generation === this.generation && !this.destroyed) callback();
    };
    media.onplaying = guard(() => { this.attempts = 0; this.observe("playing"); });
    media.onwaiting = guard(() => this.observe("buffering"));
    /* `onstalled` is deliberately left unbound. Chrome fires it every few
       seconds on a perfectly healthy MSE-backed HLS stream — readyState
       intact, no error, currentTime still climbing. Treating it as a failure
       tore the stream down and restarted it from zero on a loop; reporting it
       as buffering just flickers the status bar over playing video. A real
       outage surfaces as `waiting` (underrun) or a fatal hls.js NETWORK_ERROR,
       and both are already handled. */
    media.onerror = guard(() => this.reconnect(media.error ?? new Error("media playback failed")));
  }

  private cleanupSource(): void {
    this.hls?.destroy();
    this.hls = undefined;
    const { media } = this.options;
    media.onplaying = null;
    media.onwaiting = null;
    media.onstalled = null;
    media.onerror = null;
    media.removeAttribute("src");
    media.load();
  }

  private observe(state: PlaybackState, error?: unknown): void {
    this.options.onObservation?.({ state, attempt: this.attempts, ...(error === undefined ? {} : { error }) });
  }
}

async function defaultHlsLoader(): Promise<HlsConstructor> {
  const moduleName = "hls.js";
  const loaded = await import(moduleName) as { default: HlsConstructor };
  return loaded.default;
}

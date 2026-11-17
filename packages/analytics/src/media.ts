import { experienceEvents } from './experience-events.js';
import { randomId } from './random-id.js';
import type { Properties } from './index.js';

export type MediaEndReason = 'completed' | 'interrupted' | 'page_hidden' | 'unmounted' | 'replaced' | 'failed' | 'unknown';
export interface MediaRecorder { record(name: string, properties: Properties): boolean }
export interface MediaContext {
  surface: string;
  channel_id?: string;
  program_id?: string;
  content_id?: string;
  content_kind: 'live' | 'on_demand' | 'preview' | 'demo';
  player_kind: 'hls' | 'mp4' | 'reactor' | 'native' | 'other';
}

/** Sparse, visibility-aware media measurement. It never emits timeupdate heartbeats. */
export class MediaEngagementTracker {
  readonly mediaSessionId = randomId();
  private readonly startedAt: number;
  private activeMs = 0;
  private lastActiveAt?: number;
  private firstPlayingAt?: number;
  private bufferingAt?: number;
  private bufferMs = 0;
  private bufferCount = 0;
  private recoveryCount = 0;
  private playing = false;
  private visible = true;
  private documentVisible = true;
  private ended = false;
  private impressed = false;
  private engaged = false;
  private currentTime = 0;
  private duration = 0;
  private attempt = 0;
  private milestones = new Set<string>();
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly recorder: MediaRecorder, private readonly context: MediaContext, private readonly now: () => number = () => performance.now()) {
    this.startedAt = now();
  }

  private properties(extra: Properties = {}): Properties {
    return { ...this.context, media_session_id: this.mediaSessionId, ...extra };
  }
  private syncActive(): void {
    const now = this.now();
    if (this.lastActiveAt !== undefined) this.activeMs += Math.max(0, now - this.lastActiveAt);
    this.lastActiveAt = this.playing && this.visible && this.documentVisible ? now : undefined;
  }
  private sample(): void {
    if (this.ended) return;
    this.syncActive();
    if (!this.engaged && this.activeMs >= 10_000) {
      this.engaged = true;
      this.recorder.record(experienceEvents.mediaEngaged, this.properties({ active_ms: Math.round(this.activeMs) }));
    }
    for (const [name, threshold] of [['s30', 30_000], ['m1', 60_000], ['m5', 300_000], ['m15', 900_000]] as const) {
      if (this.context.content_kind === 'on_demand' || this.activeMs < threshold || this.milestones.has(name)) continue;
      this.milestones.add(name);
      this.recorder.record(experienceEvents.mediaWatchTime, this.properties({ milestone: name, active_ms: Math.round(this.activeMs) }));
    }
    if (this.context.content_kind === 'on_demand' && this.duration > 0) {
      const percent = Math.max(0, Math.min(100, this.currentTime / this.duration * 100));
      for (const value of [25, 50, 75, 90, 100]) {
        const name = `p${value}`;
        if (percent < value || this.milestones.has(name)) continue;
        this.milestones.add(name);
        this.recorder.record(experienceEvents.mediaProgress, this.properties({ milestone: name, completion_percent: Math.round(percent * 10) / 10 }));
      }
    }
  }
  impression(): void {
    if (this.impressed || this.ended) return;
    this.impressed = true;
    this.recorder.record(experienceEvents.mediaImpression, this.properties());
  }
  play(): void {
    if (this.ended || this.playing) return;
    this.playing = true;
    if (this.firstPlayingAt === undefined) {
      this.firstPlayingAt = this.now();
      this.recorder.record(experienceEvents.mediaStarted, this.properties({ startup_ms: Math.max(0, Math.round(this.firstPlayingAt - this.startedAt)) }));
    }
    this.syncActive();
    this.timer ??= setInterval(() => this.sample(), 1_000);
  }
  pause(): void { if (!this.playing || this.ended) return; this.syncActive(); this.playing = false; this.lastActiveAt = undefined; }
  setVisible(visible: boolean): void { if (this.visible === visible || this.ended) return; this.syncActive(); this.visible = visible; this.lastActiveAt = this.playing && this.visible && this.documentVisible ? this.now() : undefined; }
  setDocumentVisible(visible: boolean): void { if (this.documentVisible === visible || this.ended) return; this.syncActive(); this.documentVisible = visible; this.lastActiveAt = this.playing && this.visible && this.documentVisible ? this.now() : undefined; }
  progress(currentTime: number, duration: number): void { this.currentTime = Number.isFinite(currentTime) ? currentTime : 0; this.duration = Number.isFinite(duration) ? duration : 0; this.sample(); }
  buffering(attempt = 0): void { if (this.ended || this.bufferingAt !== undefined) return; this.syncActive(); this.attempt = attempt; this.bufferingAt = this.now(); this.bufferCount++; }
  recovered(attempt = this.attempt): void {
    if (this.ended || this.bufferingAt === undefined) return;
    const duration = Math.max(0, this.now() - this.bufferingAt);
    this.bufferingAt = undefined; this.bufferMs += duration; this.recoveryCount++;
    this.recorder.record(experienceEvents.mediaBuffered, this.properties({ duration_ms: Math.round(duration), attempt }));
    this.recorder.record(experienceEvents.mediaRecovered, this.properties({ recovery_ms: Math.round(duration), attempt }));
  }
  failed(errorKind: 'network' | 'media' | 'manifest' | 'autoplay' | 'unknown' = 'unknown', attempt = this.attempt): void {
    if (this.ended) return;
    this.recorder.record(experienceEvents.mediaFailed, this.properties({ error_kind: errorKind, attempt }));
  }
  control(control: 'play' | 'pause' | 'mute' | 'unmute' | 'fullscreen_enter' | 'fullscreen_exit' | 'replay'): void {
    if (!this.ended) this.recorder.record(experienceEvents.mediaControlUsed, this.properties({ control }));
  }
  end(reason: MediaEndReason = 'unknown'): void {
    if (this.ended) return;
    this.sample(); this.syncActive(); this.ended = true;
    if (this.timer) clearInterval(this.timer);
    if (this.bufferingAt !== undefined) { this.bufferMs += Math.max(0, this.now() - this.bufferingAt); this.bufferingAt = undefined; }
    const completion = this.duration > 0 ? Math.max(0, Math.min(100, this.currentTime / this.duration * 100)) : 0;
    this.recorder.record(experienceEvents.mediaEnded, this.properties({
      active_ms: Math.round(this.activeMs), elapsed_ms: Math.max(0, Math.round(this.now() - this.startedAt)),
      completion_percent: Math.round(completion * 10) / 10, buffer_ms: Math.round(this.bufferMs),
      buffer_count: this.bufferCount, recovery_count: this.recoveryCount, end_reason: reason,
    }));
  }
}

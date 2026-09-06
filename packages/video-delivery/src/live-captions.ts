export interface LiveCaptionTrackOptions {
  /** Stable application identifier for this live caption stream. */
  id: string;
  /** Viewer-facing caption picker label. */
  label: string;
  /** BCP 47 language tag passed to the native text track. */
  language: string;
  kind?: "captions" | "subtitles";
  /** Fallback visibility duration when an event does not provide an end time. */
  defaultDurationSeconds?: number;
  /** Remove cues older than this amount of media time. Defaults to two minutes. */
  retentionSeconds?: number;
  /** Test or browser-compatibility injection point for native text-track cues. */
  createCue?: LiveCaptionCueFactory;
}

export interface LiveCaptionEvent {
  text: string;
  /** Defaults to the player's current media time. */
  startTimeSeconds?: number;
  /** Use this when the caption source knows an exact end time. */
  endTimeSeconds?: number;
  /** Used with `startTimeSeconds` when no exact end time is available. */
  durationSeconds?: number;
}

export type LiveCaptionCueFactory = (
  startTimeSeconds: number,
  endTimeSeconds: number,
  text: string,
) => TextTrackCue;

export interface LiveCaptionController {
  /** The native track that the browser renders over the video. */
  readonly track: TextTrack;
  /** Adds one realtime caption, aligned to the current media timeline. */
  publish(event: LiveCaptionEvent): TextTrackCue;
  /** Removes expired cues using the current player timeline (or a supplied time). */
  prune(currentTimeSeconds?: number): void;
  /** Removes all package-managed cues and disables this track. Idempotent. */
  dispose(): void;
}

/**
 * Creates an always-visible native caption track for a live player. Unlike a
 * static VTT file, each event is timestamped as it arrives against the media
 * element's current HLS timeline.
 */
export function createLiveCaptionController(
  player: HTMLMediaElement,
  options: LiveCaptionTrackOptions,
): LiveCaptionController {
  const id = requiredText(options.id, "id");
  const label = requiredText(options.label, "label");
  const language = requiredText(options.language, "language");
  const kind = options.kind ?? "captions";
  if (kind !== "captions" && kind !== "subtitles") throw new TypeError("kind must be captions or subtitles");
  const defaultDurationSeconds = options.defaultDurationSeconds ?? 5;
  const retentionSeconds = options.retentionSeconds ?? 120;
  assertPositiveFinite("defaultDurationSeconds", defaultDurationSeconds);
  assertNonNegativeFinite("retentionSeconds", retentionSeconds);

  const track = player.addTextTrack(kind, label, language);
  track.mode = "showing";
  const createCue = options.createCue ?? createNativeCue;
  const managedCues = new Set<TextTrackCue>();
  let disposed = false;

  return {
    track,
    publish(event) {
      if (disposed) throw new Error(`Live caption track ${id} has been disposed`);
      const text = requiredText(event.text, "event.text");
      const startTimeSeconds = event.startTimeSeconds ?? player.currentTime;
      assertNonNegativeFinite("event.startTimeSeconds", startTimeSeconds);
      const endTimeSeconds = event.endTimeSeconds
        ?? startTimeSeconds + (event.durationSeconds ?? defaultDurationSeconds);
      if (!Number.isFinite(endTimeSeconds) || endTimeSeconds <= startTimeSeconds) {
        throw new TypeError("event.endTimeSeconds must be after startTimeSeconds");
      }
      track.mode = "showing";
      const cue = createCue(startTimeSeconds, endTimeSeconds, text);
      track.addCue(cue);
      managedCues.add(cue);
      pruneExpired(track, managedCues, startTimeSeconds - retentionSeconds);
      return cue;
    },
    prune(currentTimeSeconds = player.currentTime) {
      if (disposed) return;
      assertNonNegativeFinite("currentTimeSeconds", currentTimeSeconds);
      pruneExpired(track, managedCues, currentTimeSeconds - retentionSeconds);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cue of managedCues) track.removeCue(cue);
      managedCues.clear();
      track.mode = "disabled";
    },
  };
}

function pruneExpired(track: TextTrack, managedCues: Set<TextTrackCue>, cutoffSeconds: number): void {
  for (const cue of managedCues) {
    if (cue.endTime < cutoffSeconds) {
      track.removeCue(cue);
      managedCues.delete(cue);
    }
  }
}

function createNativeCue(startTimeSeconds: number, endTimeSeconds: number, text: string): TextTrackCue {
  if (typeof VTTCue !== "undefined") return new VTTCue(startTimeSeconds, endTimeSeconds, text);
  const webkit = globalThis as typeof globalThis & {
    WebKitVTTCue?: new (start: number, end: number, text: string) => TextTrackCue;
  };
  if (webkit.WebKitVTTCue) return new webkit.WebKitVTTCue(startTimeSeconds, endTimeSeconds, text);
  throw new Error("This browser does not support WebVTT cues");
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${field} is required`);
  return normalized;
}

function assertPositiveFinite(field: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${field} must be a positive finite number`);
}

function assertNonNegativeFinite(field: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${field} must be a non-negative finite number`);
}

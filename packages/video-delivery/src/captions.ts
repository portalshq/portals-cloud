/** A timed text item that can be encoded as a WebVTT sidecar file. */
export interface CaptionCue {
  id?: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  text: string;
}

interface CaptionTrackDetails {
  /** Stable, application-owned identifier for the track. */
  id: string;
  /** Human-readable picker label, for example "English". */
  label: string;
  /** BCP 47 language tag, passed to the viewer as `srclang`. */
  language: string;
  /** HTML track kind. Defaults to `captions`. */
  kind?: "captions" | "subtitles";
  /** Whether the viewer should select this track initially. At most one may be true. */
  default?: boolean;
}

/**
 * Sidecar captions rendered by this package into native `<track>` elements.
 * Provide a hosted VTT URL or directly supply timed cues for the package to
 * turn into a temporary browser-local VTT source.
 */
export type CaptionTrack = CaptionTrackDetails & (
  | { /** Public or signed HTTP(S) URL of a WebVTT (`text/vtt`) resource. */ src: string; cues?: never }
  | { cues: readonly CaptionCue[]; src?: never }
);

/**
 * Validates and copies caption metadata for safe transport in a playback
 * descriptor. Caption media remains outside the video stream.
 */
export function normalizeCaptionTracks(tracks: readonly CaptionTrack[]): CaptionTrack[] {
  const ids = new Set<string>();
  let defaultCount = 0;

  return tracks.map((track, index) => {
    const id = requiredText(track.id, `captionTracks[${index}].id`);
    if (ids.has(id)) throw new TypeError(`captionTracks contains duplicate id: ${id}`);
    ids.add(id);
    const label = requiredText(track.label, `captionTracks[${index}].label`);
    const language = requiredText(track.language, `captionTracks[${index}].language`);
    const hasSrc = track.src !== undefined;
    const hasCues = track.cues !== undefined;
    if (hasSrc === hasCues) {
      throw new TypeError(`captionTracks[${index}] must contain exactly one of src or cues`);
    }
    const kind = track.kind ?? "captions";
    if (kind !== "captions" && kind !== "subtitles") {
      throw new TypeError(`captionTracks[${index}].kind must be captions or subtitles`);
    }
    if (track.default) defaultCount += 1;
    if (defaultCount > 1) throw new TypeError("captionTracks can contain at most one default track");
    const details = { id, label, language, kind, ...(track.default ? { default: true } : {}) };
    return hasSrc
      ? { ...details, src: normalizeVttUrl(track.src!, `captionTracks[${index}].src`) }
      : { ...details, cues: normalizeCaptionCues(track.cues!, `captionTracks[${index}].cues`) };
  });
}

/** Creates a standards-compliant WebVTT document when an app owns cue generation. */
export function createWebVtt(cues: readonly CaptionCue[]): string {
  return `WEBVTT\n\n${normalizeCaptionCues(cues, "cues").map((cue) => {
    const id = cue.id === undefined ? "" : `${cue.id}\n`;
    return `${id}${formatTimestamp(cue.startTimeSeconds)} --> ${formatTimestamp(cue.endTimeSeconds)}\n${cue.text}`;
  }).join("\n\n")}\n`;
}

function normalizeCaptionCues(cues: readonly CaptionCue[], field: string): CaptionCue[] {
  if (cues.length === 0) throw new TypeError(`${field} must contain at least one cue`);
  let previousEnd = 0;
  return cues.map((cue, index) => {
    if (!Number.isFinite(cue.startTimeSeconds) || cue.startTimeSeconds < 0) {
      throw new TypeError(`${field}[${index}].startTimeSeconds must be a non-negative finite number`);
    }
    if (!Number.isFinite(cue.endTimeSeconds) || cue.endTimeSeconds <= cue.startTimeSeconds) {
      throw new TypeError(`${field}[${index}].endTimeSeconds must be after startTimeSeconds`);
    }
    if (cue.startTimeSeconds < previousEnd) {
      throw new TypeError("cues must be ordered without overlapping");
    }
    previousEnd = cue.endTimeSeconds;
    const text = requiredText(cue.text, `${field}[${index}].text`);
    const id = cue.id === undefined ? undefined : requiredText(cue.id, `${field}[${index}].id`);
    return { startTimeSeconds: cue.startTimeSeconds, endTimeSeconds: cue.endTimeSeconds, text, ...(id === undefined ? {} : { id }) };
  });
}

function normalizeVttUrl(value: string, field: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError(`${field} must use http or https`);
  }
  if (url.username || url.password || url.hash) {
    throw new TypeError(`${field} cannot include credentials or a fragment`);
  }
  return url.toString();
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${field} is required`);
  return normalized;
}

function formatTimestamp(totalSeconds: number): string {
  const milliseconds = Math.round(totalSeconds * 1_000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1_000);
  const remainder = milliseconds % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(remainder).padStart(3, "0")}`;
}

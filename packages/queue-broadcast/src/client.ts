import { normalizeCaptionTracks, type CaptionTrack, type HlsPlaybackSession } from "@portalshq/capability-video-delivery";
import type { ChatMessage } from "@portalshq/capability-realtime-fanout";

import type {
  HealthResponse,
  JobResponse,
  JobResponseMediaType,
  JobResponseStatus,
  QueuePairResponse,
  QueueSlotResponse,
  StreamInfoResponse,
} from "./generated/api.js";

export type QueueMediaType = JobResponseMediaType;
export type QueueJobStatus = JobResponseStatus;
export type QueueBroadcastJob = JobResponse;
export type QueueBroadcastHealth = HealthResponse;
export type QueueBroadcastPair = QueuePairResponse;
export type QueueBroadcastSlot = QueueSlotResponse;

export interface QueueBroadcastClientOptions {
  /** The control-plane URL for one isolated Queue Broadcast Server instance. */
  endpoint: string | URL;
  /** Server-only bearer token. Never expose this value to a browser. */
  token: string;
  /** Injection point for tests or a server runtime with a custom fetch implementation. */
  fetch?: typeof fetch;
  /** Optional longer timeout policy for multipart media upload requests. */
  uploadFetch?: typeof fetch;
}

export interface EnqueueUrlInput {
  mediaType: QueueMediaType;
  /** A completed, permitted media URL. Signed query strings are allowed here. */
  url: string;
  imageDuration?: number;
  /** Required so producer retries are safe. */
  idempotencyKey: string;
}

export interface WatchJobOptions {
  signal?: AbortSignal;
  intervalMs?: number;
  onUpdate?: (job: QueueBroadcastJob) => void | Promise<void>;
}

/** A finished file held by the trusted producer process. */
export interface QueueUploadAsset {
  /** Native Blob keeps the multipart request streamable across processes. */
  data: Blob;
  /** Metadata only; the streamer validates the actual bytes with sha256. */
  filename: string;
  /** SHA-256 of `data`, as lowercase hexadecimal. */
  sha256: string;
}

export interface EnqueuePairUploadInput {
  image: QueueUploadAsset;
  audio: QueueUploadAsset;
  /** The image's real composite duration, normally the narration duration. */
  imageDuration: number;
  /** Required, stable producer key. Retries return the original pair. */
  idempotencyKey: string;
  /** Persist the pair, but hold it from playout until `releasePair`. */
  staged?: boolean;
}

/** One independently playable finished asset uploaded to the Streamer. */
export interface EnqueueUploadInput {
  mediaType: QueueMediaType;
  asset: QueueUploadAsset;
  /** Optional image duration. Omit it to use the Streamer's configured default. */
  imageDuration?: number;
  /** Required, stable producer key. Retries return the original job. */
  idempotencyKey: string;
  /** Hold this item until its slot is atomically released. */
  staged?: boolean;
  /** Required when `staged` is true; identifies the producer's logical turn. */
  slotKey?: string;
}

export type StageUploadInput = Omit<EnqueueUploadInput, "staged" | "slotKey"> & {
  slotKey: string;
};

/** Text rendered by the streamer's FFmpeg `drawtext` filter. */
export interface TextOverlayConfig {
  text: string;
  position?: "top" | "center" | "bottom";
  fontSize?: number;
  fontColor?: string;
  /** Optional absolute path for deployments that do not have a default font. */
  fontFile?: string;
}

export interface GenerationContext {
  /** Base64 encoded last frame from previous generation for visual continuity */
  previousFrame?: string;
  /** History of prompts used in previous generations */
  previousPrompts: string[];
  /** Chat messages available for context (if chat integration enabled) */
  chatMessages?: ChatMessage[];
  /** Optional text overlay to render in the RTMP stream. */
  textOverlay?: TextOverlayConfig;
  /** Generation parameters for the current request */
  generationParams: Record<string, unknown>;
}

export interface GeneratedFrames {
  /** Base64 encoded video frames */
  frames: string[];
  /** Optional audio data in PCM format */
  audio?: ArrayBuffer;
  /** Duration of the attached audio, used to time a text overlay. */
  audioDurationSeconds?: number;
  /** Duration of the generated content in seconds */
  duration: number;
}

/**
 * Callback interface for real-time video generation.
 * The consuming application provides the AI implementation while queue-broadcast
 * handles streaming infrastructure, frame buffering, and RTMP output.
 */
export interface GenerationCallback {
  (context: GenerationContext): Promise<GeneratedFrames>;
}

/** Error returned by the queue control plane, including its HTTP status. */
export class QueueBroadcastError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "QueueBroadcastError";
  }
}

/**
 * Canonicalize a Queue Broadcast Server endpoint before it becomes a queue or
 * chat namespace. Credentials, query parameters, and fragments are not part
 * of an endpoint identity and could otherwise leak secret or routing data.
 */
export function normalizeBroadcastEndpoint(endpoint: string | URL): string {
  const url = new URL(endpoint.toString());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("Queue Broadcast endpoint must use http or https");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new TypeError(
      "Queue Broadcast endpoint cannot contain credentials, query parameters, or a fragment",
    );
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function validateSourceUrl(value: string): void {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("media url must use http or https");
  }
  if (url.username || url.password || url.hash) {
    throw new TypeError("media url cannot contain credentials or a fragment");
  }
}

function isTerminal(status: QueueJobStatus): boolean {
  return status === "done" || status === "failed";
}

const SHA256_HEX = /^[a-f0-9]{64}$/;

function validateUploadAsset(asset: QueueUploadAsset, field: string): void {
  if (!(asset.data instanceof Blob) || asset.data.size <= 0) {
    throw new TypeError(`${field}.data must be a non-empty Blob`);
  }
  if (!asset.filename.trim()) throw new TypeError(`${field}.filename is required`);
  if (!SHA256_HEX.test(asset.sha256)) {
    throw new TypeError(`${field}.sha256 must be a lowercase SHA-256 hex digest`);
  }
}

function validateImageDuration(mediaType: QueueMediaType, imageDuration: number | undefined): void {
  if (mediaType === "image") {
    if (imageDuration !== undefined && (!Number.isFinite(imageDuration) || imageDuration < 1 || imageDuration > 30)) {
      throw new TypeError("imageDuration must be a finite number between 1 and 30 seconds");
    }
  } else if (imageDuration !== undefined) {
    throw new TypeError("imageDuration is only valid for image media");
  }
}

function validateSlotKey(slotKey: string | undefined, staged: boolean | undefined): string | undefined {
  const normalized = slotKey?.trim();
  if (staged && !normalized) throw new TypeError("slotKey is required for staged uploads");
  if (!staged && normalized) throw new TypeError("slotKey is only valid for staged uploads");
  if (normalized && normalized.length > 255) throw new TypeError("slotKey must be at most 255 characters");
  return normalized;
}

function waitForPoll(intervalMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, intervalMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Server-only producer client. It controls one broadcast endpoint while
 * browser clients receive only `getPlayback().playbackManifestUrl`.
 */
export class QueueBroadcastClient {
  private readonly endpoint: string;
  private readonly token: string;
  private readonly requestFetch: typeof fetch;
  private readonly uploadRequestFetch: typeof fetch;

  constructor(options: QueueBroadcastClientOptions) {
    this.endpoint = normalizeBroadcastEndpoint(options.endpoint);
    if (!options.token.trim()) {
      throw new TypeError("Queue Broadcast bearer token is required");
    }
    this.token = options.token;
    this.requestFetch = options.fetch ?? fetch;
    this.uploadRequestFetch = options.uploadFetch ?? this.requestFetch;
  }

  async enqueueUrl(input: EnqueueUrlInput): Promise<QueueBroadcastJob> {
    validateSourceUrl(input.url);
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey) {
      throw new TypeError("idempotencyKey is required");
    }
    validateImageDuration(input.mediaType, input.imageDuration);

    return this.request<QueueBroadcastJob>("/v1/queue", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        media_type: input.mediaType,
        url: input.url,
        ...(input.imageDuration === undefined ? {} : { duration: input.imageDuration }),
      }),
    });
  }

  /**
   * Upload one finished image, audio, or video asset. The Streamer owns its
   * bytes and schedules it in FIFO order; adjacent image/audio jobs may be
   * composited there when both are ready.
   */
  async enqueueUpload(input: EnqueueUploadInput): Promise<QueueBroadcastJob> {
    validateUploadAsset(input.asset, input.mediaType);
    validateImageDuration(input.mediaType, input.imageDuration);
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey) throw new TypeError("idempotencyKey is required");
    const slotKey = validateSlotKey(input.slotKey, input.staged);

    const form = new FormData();
    form.append("file", input.asset.data, input.asset.filename);
    form.append("media_type", input.mediaType);
    form.append("sha256", input.asset.sha256);
    if (input.imageDuration !== undefined) form.append("duration", String(input.imageDuration));
    if (input.staged) form.append("staged", "true");
    if (slotKey) form.append("slot_key", slotKey);
    return this.requestMultipart<QueueBroadcastJob>("/v1/queue/upload", form, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
    });
  }

  /** Persist one item under a turn slot; use `releaseSlot` after all successes. */
  async stageUpload(input: StageUploadInput): Promise<QueueBroadcastJob> {
    return this.enqueueUpload({ ...input, staged: true });
  }

  /**
   * Send finished media bytes directly to the remote Streamer process.
   * This is the preferred ingestion path: the streamer does not download the
   * asset from an application-owned URL, and it only exposes both jobs after
   * its durable pair receipt has committed.
   */
  async enqueuePairUpload(input: EnqueuePairUploadInput): Promise<QueueBroadcastPair> {
    validateUploadAsset(input.image, "image");
    validateUploadAsset(input.audio, "audio");
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey) throw new TypeError("idempotencyKey is required");
    if (!Number.isFinite(input.imageDuration) || input.imageDuration < 1 || input.imageDuration > 30) {
      throw new TypeError("imageDuration must be a finite number between 1 and 30 seconds");
    }

    const form = new FormData();
    form.append("image", input.image.data, input.image.filename);
    form.append("audio", input.audio.data, input.audio.filename);
    form.append("image_duration", String(input.imageDuration));
    form.append("image_sha256", input.image.sha256);
    form.append("audio_sha256", input.audio.sha256);
    if (input.staged) form.append("staged", "true");
    return this.requestMultipart<QueueBroadcastPair>("/v1/queue/pairs/upload", form, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
    });
  }

  /** Persist a canonical pair during pre-roll, then activate it later. */
  async stagePair(input: Omit<EnqueuePairUploadInput, "staged">): Promise<QueueBroadcastPair> {
    return this.enqueuePairUpload({ ...input, staged: true });
  }

  async getPair(pairId: string, options: { signal?: AbortSignal } = {}): Promise<QueueBroadcastPair> {
    if (!pairId.trim()) throw new TypeError("pairId is required");
    return this.request<QueueBroadcastPair>(`/v1/queue/pairs/${encodeURIComponent(pairId)}`, options);
  }

  /** Idempotently make a previously staged pair eligible for FIFO playout. */
  async releasePair(pairId: string, options: { signal?: AbortSignal } = {}): Promise<QueueBroadcastPair> {
    if (!pairId.trim()) throw new TypeError("pairId is required");
    return this.request<QueueBroadcastPair>(`/v1/queue/pairs/${encodeURIComponent(pairId)}/release`, {
      ...options,
      method: "POST",
    });
  }

  async getSlot(slotKey: string, options: { signal?: AbortSignal } = {}): Promise<QueueBroadcastSlot> {
    const normalized = validateSlotKey(slotKey, true);
    return this.request<QueueBroadcastSlot>(`/v1/queue/slots/${encodeURIComponent(normalized!)}`, options);
  }

  /** Idempotently make every staged item in a logical turn FIFO-eligible. */
  async releaseSlot(slotKey: string, options: { signal?: AbortSignal } = {}): Promise<QueueBroadcastSlot> {
    const normalized = validateSlotKey(slotKey, true);
    return this.request<QueueBroadcastSlot>(`/v1/queue/slots/${encodeURIComponent(normalized!)}/release`, {
      ...options,
      method: "POST",
    });
  }

  async getJob(jobId: string, options: { signal?: AbortSignal } = {}): Promise<QueueBroadcastJob> {
    if (!jobId.trim()) throw new TypeError("jobId is required");
    return this.request<QueueBroadcastJob>(`/v1/queue/${encodeURIComponent(jobId)}`, options);
  }

  /** Watch a job without retaining a subscription or exposing queue tokens to a browser. */
  async *watchJob(jobId: string, options: WatchJobOptions = {}): AsyncGenerator<QueueBroadcastJob> {
    const intervalMs = Math.max(50, Math.floor(options.intervalMs ?? 1_000));
    let previousRevision: string | undefined;

    while (!options.signal?.aborted) {
      let job: QueueBroadcastJob;
      try {
        job = await this.getJob(jobId, { signal: options.signal });
      } catch (error) {
        if (options.signal?.aborted) return;
        throw error;
      }
      const revision = `${job.status}:${job.updated_at}:${job.error ?? ""}`;
      if (revision !== previousRevision) {
        previousRevision = revision;
        await options.onUpdate?.(job);
        yield job;
      }
      if (isTerminal(job.status) || options.signal?.aborted) return;
      await waitForPoll(intervalMs, options.signal);
    }
  }

  async getPlayback(
    options: { signal?: AbortSignal; captionTracks?: readonly CaptionTrack[] } = {},
  ): Promise<HlsPlaybackSession> {
    const { captionTracks, ...requestOptions } = options;
    const stream = await this.request<StreamInfoResponse>("/v1/stream", requestOptions);
    const hls = new URL(stream.hls);
    if (hls.protocol !== "http:" && hls.protocol !== "https:") {
      throw new QueueBroadcastError("queue server returned a non-http HLS URL", 502);
    }
    return {
      sessionId: this.endpoint,
      playbackManifestUrl: hls.toString(),
      ...(captionTracks === undefined ? {} : { captionTracks: normalizeCaptionTracks(captionTracks) }),
    };
  }

  async health(options: { signal?: AbortSignal } = {}): Promise<QueueBroadcastHealth> {
    return this.request<QueueBroadcastHealth>("/health", options, false);
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    authenticated = true,
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (authenticated) headers.set("Authorization", `Bearer ${this.token}`);

    let response: Response;
    try {
      response = await this.requestFetch(`${this.endpoint}${path}`, { ...init, headers });
    } catch (cause) {
      throw new QueueBroadcastError(
        `Queue Broadcast request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        0,
      );
    }

    const text = await response.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = undefined;
    }
    if (!response.ok) {
      const detail = typeof data === "object" && data !== null && "detail" in data && typeof data.detail === "string"
        ? data.detail
        : text || response.statusText;
      throw new QueueBroadcastError(`Queue Broadcast request failed (${response.status}): ${detail}`, response.status, detail);
    }
    return data as T;
  }

  private async requestMultipart<T>(path: string, body: FormData, init: RequestInit): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    headers.set("Authorization", `Bearer ${this.token}`);
    // Do not set Content-Type: fetch supplies the multipart boundary.
    let response: Response;
    try {
      response = await this.uploadRequestFetch(`${this.endpoint}${path}`, { ...init, headers, body });
    } catch (cause) {
      throw new QueueBroadcastError(
        `Queue Broadcast request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        0,
      );
    }
    const text = await response.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = undefined;
    }
    if (!response.ok) {
      const detail = typeof data === "object" && data !== null && "detail" in data && typeof data.detail === "string"
        ? data.detail
        : text || response.statusText;
      throw new QueueBroadcastError(`Queue Broadcast request failed (${response.status}): ${detail}`, response.status, detail);
    }
    return data as T;
  }
}

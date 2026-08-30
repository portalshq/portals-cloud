import type { HlsPlaybackSession } from "@portalshq/capability-video-delivery";

import type {
  HealthResponse,
  JobResponse,
  JobResponseMediaType,
  JobResponseStatus,
  StreamInfoResponse,
} from "./generated/api.js";

export type QueueMediaType = JobResponseMediaType;
export type QueueJobStatus = JobResponseStatus;
export type QueueBroadcastJob = JobResponse;
export type QueueBroadcastHealth = HealthResponse;

export interface QueueBroadcastClientOptions {
  /** The control-plane URL for one isolated Queue Broadcast Server instance. */
  endpoint: string | URL;
  /** Server-only bearer token. Never expose this value to a browser. */
  token: string;
  /** Injection point for tests or a server runtime with a custom fetch implementation. */
  fetch?: typeof fetch;
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

  constructor(options: QueueBroadcastClientOptions) {
    this.endpoint = normalizeBroadcastEndpoint(options.endpoint);
    if (!options.token.trim()) {
      throw new TypeError("Queue Broadcast bearer token is required");
    }
    this.token = options.token;
    this.requestFetch = options.fetch ?? fetch;
  }

  async enqueueUrl(input: EnqueueUrlInput): Promise<QueueBroadcastJob> {
    validateSourceUrl(input.url);
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey) {
      throw new TypeError("idempotencyKey is required");
    }
    if (input.mediaType === "image") {
      if (input.imageDuration !== undefined && (!Number.isFinite(input.imageDuration) || input.imageDuration < 1 || input.imageDuration > 30)) {
        throw new TypeError("imageDuration must be a finite number between 1 and 30 seconds");
      }
    } else if (input.imageDuration !== undefined) {
      throw new TypeError("imageDuration is only valid for image media");
    }

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

  async getPlayback(): Promise<HlsPlaybackSession> {
    const stream = await this.request<StreamInfoResponse>("/v1/stream");
    const hls = new URL(stream.hls);
    if (hls.protocol !== "http:" && hls.protocol !== "https:") {
      throw new QueueBroadcastError("queue server returned a non-http HLS URL", 502);
    }
    return { sessionId: this.endpoint, playbackManifestUrl: hls.toString() };
  }

  async health(): Promise<QueueBroadcastHealth> {
    return this.request<QueueBroadcastHealth>("/health", undefined, false);
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
}

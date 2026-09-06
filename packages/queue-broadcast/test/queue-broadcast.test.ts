import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

const childProcess = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: childProcess.spawn }));

import {
  FrameBuffer,
  QueueBroadcastClient,
  QueueBroadcastError,
  RTMPStreamer,
  getTextOverlayVisibleDuration,
  normalizeBroadcastEndpoint,
} from "../src/index.js";

const queuedJob = {
  id: "job-1", prompt: "", media_type: "video", duration: null, pair_id: null,
  source_url: "https://assets.example/video.mp4", status: "queued", error: null, created_at: 1, updated_at: 1,
};

const queuedPair = {
  pair_id: "pair-1",
  image: { ...queuedJob, id: "image-1", media_type: "image", duration: 5, source_url: null, pair_id: "pair-1", status: "staged" },
  audio: { ...queuedJob, id: "audio-1", media_type: "audio", source_url: null, pair_id: "pair-1", status: "staged" },
};

const stagedSlot = {
  slot_key: "channel:main:turn:1",
  released: false,
  jobs: [
    { ...queuedJob, id: "image-1", media_type: "image", duration: 5, slot_key: "channel:main:turn:1", status: "staged" },
    { ...queuedJob, id: "audio-1", media_type: "audio", slot_key: "channel:main:turn:1", status: "staged" },
  ],
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("QueueBroadcastClient", () => {
  it("keeps generated operations aligned with the checked-in Streamer contract", async () => {
    const contract = JSON.parse(await readFile(new URL("../openapi/streamer.json", import.meta.url), "utf8"));
    const generated = await readFile(new URL("../src/generated/api.ts", import.meta.url), "utf8");
    for (const path of Object.values(contract.paths) as Array<{ [method: string]: { operationId?: string } }>) {
      for (const operation of Object.values(path)) {
        if (operation?.operationId) expect(generated).toContain(`export const ${operation.operationId} = async`);
      }
    }
  });

  it("normalizes endpoint identity and rejects secret-bearing identifiers", () => {
    expect(normalizeBroadcastEndpoint("https://stream.example/queue/")).toBe("https://stream.example/queue");
    for (const endpoint of ["ftp://stream.example", "https://token@stream.example", "https://stream.example/?token=secret", "https://stream.example/#route"]) {
      expect(() => normalizeBroadcastEndpoint(endpoint)).toThrow();
    }
  });

  it("enqueues with a server token and idempotency header", async () => {
    const requestFetch = vi.fn().mockResolvedValue(jsonResponse(queuedJob));
    const client = new QueueBroadcastClient({ endpoint: "https://stream.example/", token: "server-secret", fetch: requestFetch });

    await expect(client.enqueueUrl({ mediaType: "video", url: "https://assets.example/video.mp4?signature=allowed", idempotencyKey: "generation:1" })).resolves.toMatchObject({ id: "job-1" });
    const [url, init] = requestFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://stream.example/v1/queue");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer server-secret");
    expect(new Headers(init.headers).get("idempotency-key")).toBe("generation:1");
  });

  it("maps typed API errors and returns a public HLS descriptor", async () => {
    const client = new QueueBroadcastClient({
      endpoint: "https://stream.example/control", token: "server-secret",
      fetch: vi.fn().mockImplementation(async (url: string) => url.endsWith("missing")
        ? jsonResponse({ detail: "job not found" }, 404)
        : jsonResponse({ hls: "https://cdn.example/live/index.m3u8", destination_count: 0, format: {} })),
    });
    await expect(client.getJob("missing")).rejects.toMatchObject({ name: "QueueBroadcastError", status: 404 } satisfies Partial<QueueBroadcastError>);
    await expect(client.getPlayback({
      captionTracks: [{ id: "en", label: "English", language: "en", src: "https://captions.example/live-en.vtt" }],
    })).resolves.toEqual({
      sessionId: "https://stream.example/control",
      playbackManifestUrl: "https://cdn.example/live/index.m3u8",
      captionTracks: [{ id: "en", label: "English", language: "en", src: "https://captions.example/live-en.vtt", kind: "captions" }],
    });
  });

  it("passes cancellation through health and playback probes", async () => {
    const requestFetch = vi.fn().mockImplementation(async (url: string) => url.endsWith("/health")
      ? jsonResponse({ ok: true })
      : jsonResponse({ hls: "https://cdn.example/live/index.m3u8", destination_count: 0, format: {} }));
    const client = new QueueBroadcastClient({ endpoint: "https://stream.example", token: "server-secret", fetch: requestFetch });
    const controller = new AbortController();

    await expect(client.health({ signal: controller.signal })).resolves.toEqual({ ok: true });
    await expect(client.getPlayback({ signal: controller.signal })).resolves.toMatchObject({
      playbackManifestUrl: "https://cdn.example/live/index.m3u8",
    });
    expect(requestFetch.mock.calls).toHaveLength(2);
    expect(requestFetch.mock.calls[0][1].signal).toBe(controller.signal);
    expect(requestFetch.mock.calls[1][1].signal).toBe(controller.signal);
  });

  it("directly uploads an atomic pair as authenticated multipart data and releases a staged pair", async () => {
    const uploadFetch = vi.fn().mockResolvedValueOnce(jsonResponse(queuedPair));
    const requestFetch = vi.fn().mockResolvedValueOnce(jsonResponse({
        ...queuedPair,
        image: { ...queuedPair.image, status: "queued" },
        audio: { ...queuedPair.audio, status: "queued" },
      }));
    const client = new QueueBroadcastClient({
      endpoint: "https://stream.example",
      token: "server-secret",
      fetch: requestFetch,
      uploadFetch,
    });
    const digest = "a".repeat(64);
    await expect(client.stagePair({
      image: { data: new Blob(["image"], { type: "image/jpeg" }), filename: "scene.jpg", sha256: digest },
      audio: { data: new Blob(["audio"], { type: "audio/wav" }), filename: "narration.wav", sha256: digest },
      imageDuration: 5,
      idempotencyKey: "channel:one:block:1:segment:0",
    })).resolves.toMatchObject({ pair_id: "pair-1", image: { status: "staged" } });

    const [uploadUrl, uploadInit] = uploadFetch.mock.calls[0] as [string, RequestInit];
    expect(uploadUrl).toBe("https://stream.example/v1/queue/pairs/upload");
    expect(new Headers(uploadInit.headers).get("authorization")).toBe("Bearer server-secret");
    expect(new Headers(uploadInit.headers).get("idempotency-key")).toBe("channel:one:block:1:segment:0");
    expect(new Headers(uploadInit.headers).get("content-type")).toBeNull();
    const form = uploadInit.body as FormData;
    expect(form.get("staged")).toBe("true");
    expect(form.get("image_duration")).toBe("5");
    expect(form.get("image_sha256")).toBe(digest);

    await expect(client.releasePair("pair-1")).resolves.toMatchObject({ image: { status: "queued" } });
    expect(requestFetch.mock.calls[0][0]).toBe("https://stream.example/v1/queue/pairs/pair-1/release");
  });

  it("uploads independent staged items with checksums and atomically releases their slot", async () => {
    const uploadFetch = vi.fn().mockResolvedValue(jsonResponse(stagedSlot.jobs[0]));
    const requestFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(stagedSlot))
      .mockResolvedValueOnce(jsonResponse({ ...stagedSlot, released: true, jobs: stagedSlot.jobs.map((job) => ({ ...job, status: "queued" })) }));
    const client = new QueueBroadcastClient({
      endpoint: "https://stream.example",
      token: "server-secret",
      fetch: requestFetch,
      uploadFetch,
    });
    const digest = "a".repeat(64);
    await expect(client.stageUpload({
      mediaType: "image",
      asset: { data: new Blob(["image"], { type: "image/jpeg" }), filename: "scene.jpg", sha256: digest },
      imageDuration: 5,
      idempotencyKey: "channel:main:turn:1:image",
      slotKey: "channel:main:turn:1",
    })).resolves.toMatchObject({ id: "image-1", status: "staged" });

    const [uploadUrl, uploadInit] = uploadFetch.mock.calls[0] as [string, RequestInit];
    expect(uploadUrl).toBe("https://stream.example/v1/queue/upload");
    expect(new Headers(uploadInit.headers).get("authorization")).toBe("Bearer server-secret");
    expect(new Headers(uploadInit.headers).get("idempotency-key")).toBe("channel:main:turn:1:image");
    const form = uploadInit.body as FormData;
    expect(form.get("media_type")).toBe("image");
    expect(form.get("duration")).toBe("5");
    expect(form.get("sha256")).toBe(digest);
    expect(form.get("staged")).toBe("true");
    expect(form.get("slot_key")).toBe("channel:main:turn:1");

    await expect(client.getSlot("channel:main:turn:1")).resolves.toMatchObject({ released: false });
    await expect(client.releaseSlot("channel:main:turn:1")).resolves.toMatchObject({
      released: true,
      jobs: expect.arrayContaining([expect.objectContaining({ status: "queued" })]),
    });
    expect(requestFetch.mock.calls[0][0]).toBe("https://stream.example/v1/queue/slots/channel%3Amain%3Aturn%3A1");
    expect(requestFetch.mock.calls[1][0]).toBe("https://stream.example/v1/queue/slots/channel%3Amain%3Aturn%3A1/release");
  });

  it("accepts standalone audio while rejecting malformed slot requests before upload", async () => {
    const uploadFetch = vi.fn().mockResolvedValue(jsonResponse({ ...queuedJob, media_type: "audio" }));
    const client = new QueueBroadcastClient({ endpoint: "https://stream.example", token: "server-secret", uploadFetch });
    await expect(client.enqueueUpload({
      mediaType: "audio",
      asset: { data: new Blob(["audio"]), filename: "voice.wav", sha256: "a".repeat(64) },
      idempotencyKey: "audio:1",
    })).resolves.toMatchObject({ media_type: "audio" });
    await expect(client.enqueueUpload({
      mediaType: "audio",
      asset: { data: new Blob(["audio"]), filename: "voice.wav", sha256: "a".repeat(64) },
      idempotencyKey: "audio:2",
      slotKey: "turn:1",
    })).rejects.toThrow("slotKey is only valid");
    expect(uploadFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed direct-upload assets before sending a request", async () => {
    const requestFetch = vi.fn();
    const client = new QueueBroadcastClient({ endpoint: "https://stream.example", token: "server-secret", fetch: requestFetch });
    await expect(client.enqueuePairUpload({
      image: { data: new Blob(["image"]), filename: "image.jpg", sha256: "bad" },
      audio: { data: new Blob(["audio"]), filename: "audio.wav", sha256: "a".repeat(64) },
      imageDuration: 5,
      idempotencyKey: "pair",
    })).rejects.toThrow("sha256");
    expect(requestFetch).not.toHaveBeenCalled();
  });
});

describe("FrameBuffer", () => {
  it("bounds the queue by dropping the oldest frame", () => {
    const buffer = new FrameBuffer<string>({ maxSize: 2 });
    expect(buffer.addFrame("first")).toBe(true);
    buffer.addFrame("second");
    expect(buffer.addFrame("third")).toBe(false);
    expect(buffer.getStatus()).toMatchObject({ queueSize: 2, framesDropped: 1 });
    expect(buffer.getNextFrame()).toBe("second");
    expect(buffer.getNextFrame()).toBe("third");
  });

  it("validates capacity, tracks batches, clears frames, and resets counters", () => {
    expect(() => new FrameBuffer({ maxSize: 0 })).toThrow("maxSize");
    const buffer = new FrameBuffer<string>({ maxSize: 2 });
    expect(buffer.addFrameBatch(["one", "two", "three"])).toBe(3);
    expect(buffer.getStatus()).toMatchObject({ queueSize: 2, framesDropped: 1, framesAddedTotal: 3 });
    buffer.clear();
    expect(buffer.getNextFrame()).toBeNull();
    expect(buffer.getStatus()).toMatchObject({ queueSize: 0, framesDropped: 1 });
    buffer.resetMetrics();
    expect(buffer.getStatus()).toMatchObject({ framesDropped: 0, framesAddedTotal: 0 });
  });
});

describe("RTMPStreamer", () => {
  it("starts FFmpeg with an image pipe, writes Base64 JPEG frames, and stops gracefully", async () => {
    vi.useFakeTimers();
    const fakeProcess = createFakeProcess();
    childProcess.spawn.mockReturnValue(fakeProcess);
    const streamer = new RTMPStreamer({
      streamKey: "key", rtmpUrl: "rtmps://stream.example/app/key", ffmpegPath: "/opt/ffmpeg", fps: 20, enableAudio: true,
      textOverlay: { text: "Tonight: Ada's stream", position: "top", fontSize: 28, fontColor: "#fefefe" },
      audioDurationSeconds: 8,
    });

    await streamer.startStream();
    expect(childProcess.spawn).toHaveBeenCalledWith("/opt/ffmpeg", expect.arrayContaining([
      "-f", "image2pipe", "-vcodec", "mjpeg", "-vf",
      "drawtext=text='Tonight\\: Ada\\'s stream':x=(w-text_w)/2:y=20:fontsize=28:fontcolor=#fefefe:enable='between(t,0,11)'",
      "-f", "flv",
    ]), expect.any(Object));
    expect(streamer.addFrame("data:image/jpeg;base64,/9j/2Q==")).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fakeProcess.stdin.write).toHaveBeenCalledWith(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    expect(streamer.getStatus()).toMatchObject({ isStreaming: true, framesSent: 1 });

    await streamer.stopStream();
    expect(fakeProcess.stdin.end).toHaveBeenCalledOnce();
    expect(streamer.getStatus().isStreaming).toBe(false);
  });

  it("rejects invalid frames and reflects FFmpeg failures in stream health", async () => {
    const fakeProcess = createFakeProcess();
    childProcess.spawn.mockReturnValue(fakeProcess);
    const streamer = new RTMPStreamer({ streamKey: "key" });
    await streamer.startStream();
    expect(() => streamer.addFrame("not a jpeg")).toThrow("Base64");
    expect(() => streamer.addFrame("AAAA")).toThrow("complete JPEG");
    fakeProcess.emit("error", new Error("broken pipe"));
    expect(streamer.getStatus()).toMatchObject({ isStreaming: false, lastError: "broken pipe" });
  });

  it("handles underruns, bounded queues, drain backpressure, and validates configuration", async () => {
    vi.useFakeTimers();
    const fakeProcess = createFakeProcess();
    fakeProcess.stdin.write.mockReturnValueOnce(false);
    childProcess.spawn.mockReturnValue(fakeProcess);
    const streamer = new RTMPStreamer({ streamKey: "key", maxBufferSize: 2, fps: 10 });
    await streamer.startStream();
    await vi.advanceTimersByTimeAsync(0);
    expect(streamer.getStatus()).toMatchObject({ framesUnderrun: 1, framesSent: 0 });

    expect(streamer.addFrameBatch(["/9j/2Q==", "/9j/2Q==", "/9j/2Q=="])).toBe(3);
    expect(streamer.getStatus().framesDropped).toBe(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(fakeProcess.stdin.write).toHaveBeenCalledTimes(1);
    fakeProcess.stdin.emit("drain");
    await vi.advanceTimersByTimeAsync(0);
    expect(fakeProcess.stdin.write).toHaveBeenCalledTimes(2);
    await streamer.stopStream();

    expect(() => new RTMPStreamer({ streamKey: "", rtmpUrl: "rtmp://stream.example/app" })).toThrow("streamKey");
    expect(() => new RTMPStreamer({ streamKey: "key", fps: 0 })).toThrow("fps");
    expect(() => new RTMPStreamer({ streamKey: "key", rtmpUrl: "https://stream.example" })).toThrow("rtmpUrl");
    expect(() => new RTMPStreamer({ streamKey: "key", width: 0 })).toThrow("width");
    expect(() => new RTMPStreamer({ streamKey: "key", height: 0 })).toThrow("height");
    expect(() => new RTMPStreamer({ streamKey: "key", shutdownTimeoutMs: -1 })).toThrow("shutdownTimeoutMs");
    expect(() => new RTMPStreamer({ streamKey: "key", audioDurationSeconds: -1 })).toThrow("audioDurationSeconds");
    expect(() => new RTMPStreamer({ streamKey: "key", textOverlay: { text: "", fontSize: 20 } })).toThrow("textOverlay.text");
    expect(() => new RTMPStreamer({ streamKey: "key", textOverlay: { text: "hello", fontSize: 0 } })).toThrow("textOverlay.fontSize");
    expect(new RTMPStreamer({ streamKey: "key" }).getStatus()).toMatchObject({ isStreaming: false, targetFps: 24 });
    expect(getTextOverlayVisibleDuration()).toBe(5);
    expect(getTextOverlayVisibleDuration(12)).toBe(15);
  });
});

function createFakeProcess() {
  const stdin = Object.assign(new EventEmitter(), {
    writable: true,
    destroyed: false,
    write: vi.fn(() => true),
    end: vi.fn(),
  });
  const process = Object.assign(new EventEmitter(), {
    stdin,
    exitCode: null as number | null,
    killed: false,
    kill: vi.fn(() => true),
  });
  stdin.end.mockImplementation(() => {
    queueMicrotask(() => {
      process.exitCode = 0;
      process.emit("exit", 0, null);
    });
  });
  queueMicrotask(() => process.emit("spawn"));
  return process;
}

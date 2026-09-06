import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveDelivery } from "../src/index.js";

afterEach(() => vi.useRealTimers());

describe("LiveDelivery", () => {
  it("connects one configured manifest, retries failures, and monitors health", async () => {
    vi.useFakeTimers();
    const requestFetch = vi.fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValue(new Response("#EXTM3U", { status: 200 }));
    const delivery = new LiveDelivery({
      sessionId: "morning",
      playbackManifestUrl: "https://media.example/morning/index.m3u8",
      retryAttempts: 2,
      retryDelayMs: 0,
      healthCheckIntervalMs: 10,
      fetch: requestFetch,
    });

    const started = delivery.start();
    await vi.advanceTimersByTimeAsync(0);
    await expect(started).resolves.toEqual({
      sessionId: "morning",
      playbackManifestUrl: "https://media.example/morning/index.m3u8",
    });
    expect(requestFetch).toHaveBeenCalledTimes(2);
    expect(delivery.getStatus()).toMatchObject({ isRunning: true, isHealthy: true });

    await vi.advanceTimersByTimeAsync(10);
    expect(requestFetch).toHaveBeenCalledTimes(3);
    await delivery.stop();
    expect(delivery.getStatus()).toMatchObject({ isRunning: false, isHealthy: false });
  });

  it("returns copied sidecar caption metadata without modifying the stream", async () => {
    const captionTracks = [{
      id: "en", label: "English", language: "en", src: "https://captions.example/live-en.vtt", default: true,
    }];
    const delivery = new LiveDelivery({
      sessionId: "captioned",
      playbackManifestUrl: "https://media.example/live.m3u8",
      captionTracks,
      fetch: vi.fn().mockResolvedValue(new Response("#EXTM3U", { status: 200 })),
    });
    captionTracks[0].label = "Changed after construction";

    await expect(delivery.start()).resolves.toEqual({
      sessionId: "captioned",
      playbackManifestUrl: "https://media.example/live.m3u8",
      captionTracks: [{
        id: "en", label: "English", language: "en", src: "https://captions.example/live-en.vtt", kind: "captions", default: true,
      }],
    });
    await delivery.stop();
  });

  it("reports an unhealthy stream when all connection attempts fail", async () => {
    const delivery = new LiveDelivery({
      sessionId: "afternoon",
      playbackManifestUrl: "https://media.example/afternoon/index.m3u8",
      retryAttempts: 1,
      fetch: vi.fn().mockResolvedValue(new Response("missing", { status: 404 })),
    });

    await expect(delivery.start()).rejects.toThrow("Unable to connect");
    expect(delivery.getStatus()).toMatchObject({ isRunning: false, isHealthy: false, lastError: "manifest returned HTTP 404" });
  });

  it("keeps running but reports an intermittent monitoring failure", async () => {
    vi.useFakeTimers();
    const requestFetch = vi.fn()
      .mockResolvedValueOnce(new Response("#EXTM3U", { status: 200 }))
      .mockRejectedValueOnce(new Error("network interrupted"));
    const delivery = new LiveDelivery({
      sessionId: "night", playbackManifestUrl: "https://media.example/night/index.m3u8",
      retryAttempts: 1, healthCheckIntervalMs: 10, fetch: requestFetch,
    });
    await delivery.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(delivery.getStatus()).toMatchObject({ isRunning: true, isHealthy: false, lastError: "network interrupted" });
    await delivery.stop();
  });

  it("rejects stream configuration that cannot describe a public HLS manifest", () => {
    expect(() => new LiveDelivery({ sessionId: "", playbackManifestUrl: "https://media.example/live.m3u8" })).toThrow("sessionId");
    expect(() => new LiveDelivery({ sessionId: "stream", playbackManifestUrl: "rtmp://media.example/live" })).toThrow("http or https");
    expect(() => new LiveDelivery({ sessionId: "stream", playbackManifestUrl: "https://secret@media.example/live.m3u8" })).toThrow("credentials");
  });

  it("does not overlap periodic health probes", async () => {
    vi.useFakeTimers();
    let resolveProbe!: (response: Response) => void;
    const pendingProbe = new Promise<Response>((resolve) => { resolveProbe = resolve; });
    const requestFetch = vi.fn()
      .mockResolvedValueOnce(new Response("#EXTM3U", { status: 200 }))
      .mockReturnValueOnce(pendingProbe)
      .mockResolvedValue(new Response("#EXTM3U", { status: 200 }));
    const delivery = new LiveDelivery({
      sessionId: "single-flight",
      playbackManifestUrl: "https://media.example/live.m3u8",
      retryAttempts: 1,
      healthCheckIntervalMs: 10,
      requestTimeoutMs: 1_000,
      fetch: requestFetch,
    });

    await delivery.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(requestFetch).toHaveBeenCalledTimes(2);

    resolveProbe(new Response("#EXTM3U", { status: 200 }));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(10);
    expect(requestFetch).toHaveBeenCalledTimes(3);
    await delivery.stop();
  });

  it("cancels an in-flight start and permits an immediate restart", async () => {
    const requestFetch = vi.fn((_: string | URL | Request, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      if (requestFetch.mock.calls.length > 1) resolve(new Response("#EXTM3U", { status: 200 }));
    }));
    const delivery = new LiveDelivery({
      sessionId: "restart",
      playbackManifestUrl: "https://media.example/live.m3u8",
      retryAttempts: 1,
      requestTimeoutMs: 100,
      fetch: requestFetch,
    });

    const firstStart = delivery.start();
    await delivery.stop();
    await expect(firstStart).rejects.toThrow("stopped");
    await expect(delivery.start()).resolves.toMatchObject({ sessionId: "restart" });
    await delivery.stop();
  });

  it("aborts manifest requests that exceed the configured timeout", async () => {
    vi.useFakeTimers();
    const requestFetch = vi.fn((_: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    const delivery = new LiveDelivery({
      sessionId: "timeout",
      playbackManifestUrl: "https://media.example/live.m3u8",
      retryAttempts: 1,
      requestTimeoutMs: 10,
      fetch: requestFetch,
    });

    const starting = delivery.start();
    const rejected = expect(starting).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(10);
    await rejected;
    expect(delivery.getStatus()).toMatchObject({ isHealthy: false });
  });
});

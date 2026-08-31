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
});

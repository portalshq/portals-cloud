import { afterEach, describe, expect, it, vi } from "vitest";

import { RealtimeEngine } from "../src/index.js";

afterEach(() => vi.useRealTimers());

describe("RealtimeEngine", () => {
  it("supports explicit activation without a viewer", async () => {
    vi.useFakeTimers();
    const onActivate = vi.fn().mockResolvedValue(true);
    const onTick = vi.fn().mockResolvedValue({ continue: true });
    const engine = new RealtimeEngine({ onActivate, onTick, tickIntervalMs: 10 });

    await engine.ensureActive("channel-a");
    expect(engine.isRunning("channel-a")).toBe(true);
    expect(onActivate).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(10);
    expect(onTick).toHaveBeenCalledOnce();
    await engine.shutdown();
  });

  it("never overlaps asynchronous ticks", async () => {
    vi.useFakeTimers();
    let resolveFirst!: (value: { continue: boolean }) => void;
    const first = new Promise<{ continue: boolean }>((resolve) => { resolveFirst = resolve; });
    const onTick = vi.fn()
      .mockReturnValueOnce(first)
      .mockResolvedValue({ continue: true });
    const engine = new RealtimeEngine({
      onActivate: vi.fn().mockResolvedValue(true),
      onTick,
      tickIntervalMs: 10,
    });

    await engine.ensureActive("channel-a");
    await vi.advanceTimersByTimeAsync(100);
    expect(onTick).toHaveBeenCalledOnce();

    resolveFirst({ continue: true });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(9);
    expect(onTick).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(onTick).toHaveBeenCalledTimes(2);
    await engine.shutdown();
  });

  it("deduplicates activation while a viewer recheck is pending", async () => {
    vi.useFakeTimers();
    const onActivate = vi.fn().mockResolvedValue({ scheduleRecheckAt: Date.now() + 100 });
    const engine = new RealtimeEngine({
      onActivate,
      onTick: vi.fn().mockResolvedValue({ continue: true }),
    });

    await engine.addViewer("channel-a", "viewer-1");
    await engine.addViewer("channel-a", "viewer-2");
    expect(onActivate).toHaveBeenCalledOnce();
    engine.removeViewer("channel-a", "viewer-1");
    engine.removeViewer("channel-a", "viewer-2");
    await vi.advanceTimersByTimeAsync(100);
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it("does not start a timer when stopped during activation", async () => {
    vi.useFakeTimers();
    let resolveActivation!: (value: boolean) => void;
    const activation = new Promise<boolean>((resolve) => { resolveActivation = resolve; });
    const onTick = vi.fn().mockResolvedValue({ continue: true });
    const engine = new RealtimeEngine({
      onActivate: vi.fn().mockReturnValue(activation),
      onTick,
      tickIntervalMs: 10,
    });

    const starting = engine.ensureActive("channel-a");
    await engine.stop("channel-a");
    resolveActivation(true);
    await starting;
    await vi.advanceTimersByTimeAsync(20);
    expect(engine.isRunning("channel-a")).toBe(false);
    expect(onTick).not.toHaveBeenCalled();
  });
});

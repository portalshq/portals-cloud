import { describe, expect, it, vi } from "vitest";

import { LiveProgrammingScheduler } from "../src/live-programming.js";

describe("LiveProgrammingScheduler", () => {
  it("releases one eligible candidate once", async () => {
    vi.useFakeTimers();
    const release = vi.fn().mockResolvedValue(undefined);
    const candidate = { id: "one", kind: "canonical", eligibleAt: new Date(0), estimatedDurationMs: 1_000, priority: 1 };
    const scheduler = new LiveProgrammingScheduler("session", {
      intervalMs: 10,
      now: () => new Date(100),
      policy: { nextCandidates: vi.fn().mockResolvedValue([candidate]), canRelease: () => true },
      release: { release },
    }, () => true);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(30);
    expect(release).toHaveBeenCalledOnce();
    await scheduler.stop();
    vi.useRealTimers();
  });

  it("aborts and joins an in-flight release on stop", async () => {
    vi.useFakeTimers();
    let releaseFinished = false;
    const scheduler = new LiveProgrammingScheduler("session", {
      intervalMs: 10,
      now: () => new Date(100),
      policy: {
        nextCandidates: async () => [{ id: "one", kind: "canonical", eligibleAt: new Date(0), estimatedDurationMs: 1_000, priority: 1 }],
        canRelease: () => true,
      },
      release: {
        release: (_candidate, signal) => new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => { releaseFinished = true; resolve(); }, { once: true });
        }),
      },
    }, () => true);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    await scheduler.stop();
    expect(releaseFinished).toBe(true);
    vi.useRealTimers();
  });
});

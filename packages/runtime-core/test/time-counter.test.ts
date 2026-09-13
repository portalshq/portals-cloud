import { describe, expect, it } from "vitest";

import { TimeCounter, countdownAt, type TimeCounterClock } from "../src/index.js";

describe("TimeCounter", () => {
  it("uses monotonic elapsed time and wall-clock deadlines", () => {
    let wall = 10_000;
    let monotonic = 100;
    const clock: TimeCounterClock = { now: () => wall, monotonicNow: () => monotonic };
    const counter = new TimeCounter({ intervalMs: 1_000, clock });

    wall += 1_000;
    monotonic += 1_000;
    const first = counter.next();
    expect(first).toMatchObject({ sequence: 1, elapsedMs: 1_000, deltaMs: 1_000 });
    expect(first.countdown(new Date(13_500))).toMatchObject({ remainingMs: 2_500, remainingSeconds: 3, expired: false });

    wall -= 5_000;
    monotonic += 1_000;
    expect(counter.next()).toMatchObject({ sequence: 2, elapsedMs: 2_000, deltaMs: 1_000 });
  });

  it("clamps countdowns and progress at exact boundaries", () => {
    expect(countdownAt(new Date(2_000), new Date(2_000), new Date(1_000))).toMatchObject({
      remainingMs: 0, remainingSeconds: 0, elapsedMs: 1_000, progress: 1, expired: true,
    });
  });
});

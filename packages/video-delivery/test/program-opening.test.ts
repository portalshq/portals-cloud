import { afterEach, describe, expect, it, vi } from "vitest";
import { ProgramOpeningSequence } from "../src/program-opening.js";

afterEach(() => { vi.useRealTimers(); });

describe("ProgramOpeningSequence", () => {
  it("fades at the scheduled start and finishes even when the next schedule refreshes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const onPhaseChange = vi.fn();
    const opening = new ProgramOpeningSequence({ onPhaseChange });
    opening.update(false, new Date(10_000).toISOString());
    opening.update(true, new Date(10_000).toISOString()); // preroll is not the session start
    vi.advanceTimersByTime(8999);
    expect(onPhaseChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onPhaseChange.mock.lastCall).toEqual(["fade-out"]);
    vi.advanceTimersByTime(1000);
    expect(onPhaseChange.mock.lastCall).toEqual(["title"]);
    opening.update(true, new Date(100_000).toISOString());
    vi.advanceTimersByTime(2500);
    expect(onPhaseChange.mock.lastCall).toEqual(["fade-in"]);
    vi.advanceTimersByTime(1000);
    expect(onPhaseChange.mock.lastCall).toEqual(["idle"]);
    opening.dispose();
  });

  it("runs once on an unscheduled live transition, but not on a mid-session join", () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const onPhaseChange = vi.fn();
    const joinedLive = new ProgramOpeningSequence({ onPhaseChange });
    joinedLive.update(true);
    expect(onPhaseChange).not.toHaveBeenCalled();
    joinedLive.dispose();
    const opening = new ProgramOpeningSequence({ onPhaseChange });
    opening.update(false);
    opening.update(true);
    opening.update(true);
    expect(onPhaseChange).toHaveBeenCalledTimes(1);
    expect(onPhaseChange).toHaveBeenCalledWith("fade-out");
    opening.dispose();
    vi.runAllTimers();
    expect(onPhaseChange).toHaveBeenCalledTimes(1);
  });

  it("does not replay an opening long after a suspended tab resumes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const onPhaseChange = vi.fn();
    const opening = new ProgramOpeningSequence({ onPhaseChange });
    opening.update(false, new Date(10_000).toISOString());
    vi.setSystemTime(120_000);
    vi.runOnlyPendingTimers();
    expect(onPhaseChange).not.toHaveBeenCalled();
    opening.dispose();
  });

  it("reschedules cancelled starts and avoids replay when playback arrives after the scheduled opening", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const onPhaseChange = vi.fn();
    const opening = new ProgramOpeningSequence({ onPhaseChange });
    opening.update(false, new Date(10_000).toISOString());
    opening.update(false, new Date(20_000).toISOString());
    vi.advanceTimersByTime(19_000);
    expect(onPhaseChange).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    opening.update(true, new Date(100_000).toISOString());
    expect(onPhaseChange).toHaveBeenCalledTimes(4);
    opening.dispose();
  });
});

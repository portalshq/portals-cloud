import { describe, expect, it, vi } from "vitest";

import { ContentQueuePipeline } from "../src/index.js";

describe("ContentQueuePipeline", () => {
  it("prepares concurrently but commits in enqueue order", async () => {
    const resolvers = new Map<number, (value: string) => void>();
    const commits: number[] = [];
    const pipeline = new ContentQueuePipeline<number, string>({
      limits: { maxInFlight: 2, maxContentCount: 3 },
      identity: (ordinal) => ({ channelId: "one", runEpoch: "run", contentKey: "block", ordinal }),
      estimate: () => ({ durationMs: 1_000, bytes: 10, contentCount: 1 }),
      measure: () => ({ durationMs: 1_000, bytes: 10, contentCount: 1 }),
      prepare: (ordinal) => new Promise((resolve) => resolvers.set(ordinal, resolve)),
      commit: async (observation) => { commits.push(observation.identity.ordinal); },
    });
    const first = pipeline.enqueue(0);
    const second = pipeline.enqueue(1);
    resolvers.get(1)?.("second");
    await Promise.resolve();
    expect(commits).toEqual([]);
    resolvers.get(0)?.("first");
    await expect(first.completion).resolves.toBe("first");
    await expect(second.completion).resolves.toBe("second");
    expect(commits).toEqual([0, 1]);
  });

  it("deduplicates identity and counts a shared visual once", async () => {
    const prepare = vi.fn().mockResolvedValue("ready");
    const pipeline = new ContentQueuePipeline<number, string>({
      limits: { maxInFlight: 1, maxBytes: 10, maxContentCount: 2 },
      identity: (ordinal) => ({ channelId: "one", runEpoch: "run", contentKey: "block", ordinal }),
      estimate: () => ({ durationMs: 1, bytes: 10, contentCount: 1, visualKey: "image-a" }),
      measure: () => ({ durationMs: 1, bytes: 10, contentCount: 1, visualKey: "image-a" }),
      prepare,
      commit: async () => {},
    });
    const one = pipeline.enqueue(0);
    const duplicate = pipeline.enqueue(0);
    const two = pipeline.enqueue(1);
    await Promise.all([one.completion, duplicate.completion, two.completion]);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(pipeline.capacity()).toMatchObject({ bytes: 10, contentCount: 2 });
  });

  it("rejects prepared content when its measured size exceeds the bound", async () => {
    const commit = vi.fn();
    const pipeline = new ContentQueuePipeline<number, string>({
      limits: { maxInFlight: 1, maxBytes: 10 },
      identity: (ordinal) => ({ channelId: "one", runEpoch: "run", contentKey: "block", ordinal }),
      estimate: () => ({ durationMs: 1, bytes: 1, contentCount: 1 }),
      measure: () => ({ durationMs: 1, bytes: 11, contentCount: 1 }),
      prepare: async () => "too-large",
      commit,
    });

    await expect(pipeline.enqueue(0).completion).rejects.toThrow("Content queue bytes capacity exceeded");
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({ state: "terminal-failed" }),
      undefined,
      0,
    );
  });
});

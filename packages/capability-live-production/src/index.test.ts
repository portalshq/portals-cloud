import { describe, expect, it } from "vitest";
import { createLiveProduction, createVideoProvider, type ProductionCheckpoint } from "./index.js";

describe("live production", () => {
  it("exports the video provider factory from the package entry point", () => {
    expect(createVideoProvider).toBeTypeOf("function");
  });

  it("stages and releases the scheduled material once", async () => {
    let checkpoint: ProductionCheckpoint | null = null;
    const calls: string[] = [];
    const production = createLiveProduction({
      journal: { load: async () => checkpoint, save: async (value) => { checkpoint = value; } },
      schedule: { phase: async () => "ambient" },
      material: { ambient: async () => ({ key: "ambient-1" }), canonical: async () => ({ key: "canonical-1" }) },
      queue: { stage: async (slot) => { calls.push(`stage:${slot.key}`); }, release: async (key) => { calls.push(`release:${key}`); } },
    });

    await expect(production.reconcile("demo")).resolves.toMatchObject({ mode: "ambient", slotKey: "ambient-1" });
    expect(calls).toEqual(["stage:ambient-1", "release:ambient-1"]);
  });

  it("fails before touching material when the intent checkpoint cannot be written", async () => {
    let materialCalls = 0;
    const production = createLiveProduction({
      journal: { load: async () => null, save: async () => { throw new Error("channel id is not in channels"); } },
      schedule: { phase: async () => "ambient" },
      material: { ambient: async () => { materialCalls++; return { key: "x" }; }, canonical: async () => { materialCalls++; return { key: "y" }; } },
      queue: { stage: async () => {}, release: async () => {} },
    });

    await expect(production.reconcile("demo")).rejects.toThrow("channel id is not in channels");
    expect(materialCalls).toBe(0);
  });

  it("still resolves the shipped checkpoint when only the final write fails", async () => {
    const saves: ProductionCheckpoint[] = [];
    const journalErrors: unknown[] = [];
    const production = createLiveProduction({
      journal: {
        load: async () => null,
        // Intent write succeeds; the slotKey write fails.
        save: async (value) => { if (value.slotKey) throw new Error("journal disk full"); saves.push(value); },
      },
      schedule: { phase: async () => "episode" },
      material: { ambient: async () => ({ key: "a" }), canonical: async () => ({ key: "ep-1" }) },
      queue: { stage: async () => {}, release: async () => {} },
      onJournalError: (_checkpoint, cause) => { journalErrors.push(cause); },
    });

    await expect(production.reconcile("demo")).resolves.toMatchObject({ mode: "episode", slotKey: "ep-1" });
    expect(journalErrors).toHaveLength(1);
    expect(saves).toEqual([{ channelId: "demo", desired: "running", mode: "episode" }]);
  });
});

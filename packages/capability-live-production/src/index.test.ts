import { describe, expect, it } from "vitest";
import { createLiveProduction, type ProductionCheckpoint } from "./index.js";

describe("live production", () => {
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
});

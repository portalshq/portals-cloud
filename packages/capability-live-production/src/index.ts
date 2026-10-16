export type ProductionMode = "stopped" | "ambient" | "preparing" | "episode";
export type ProductionCheckpoint = { channelId: string; desired: "running" | "stopped"; mode: ProductionMode; slotKey?: string; sessionId?: string };
export type PreparedSlot = { key: string; caption?: string };

export type ProductionJournal = {
  load(channelId: string): Promise<ProductionCheckpoint | null>;
  save(checkpoint: ProductionCheckpoint): Promise<void>;
};

export type ProductionSchedule = {
  phase(channelId: string, now: Date): Promise<"ambient" | "preparing" | "episode">;
};

export type ProductionMaterial = {
  ambient(channelId: string): Promise<PreparedSlot>;
  canonical(channelId: string): Promise<PreparedSlot>;
};

export type SlotQueue = {
  stage(slot: PreparedSlot): Promise<void>;
  release(slotKey: string): Promise<void>;
};

export type LiveProduction = {
  reconcile(channelId: string): Promise<ProductionCheckpoint>;
  stop(channelId: string): Promise<void>;
};

export function createLiveProduction(dependencies: {
  journal: ProductionJournal;
  schedule: ProductionSchedule;
  material: ProductionMaterial;
  queue: SlotQueue;
  now?: () => Date;
}): LiveProduction {
  const now = dependencies.now ?? (() => new Date());

  return {
    async reconcile(channelId) {
      const previous = await dependencies.journal.load(channelId);
      if (previous?.desired === "stopped") return previous;
      const mode = await dependencies.schedule.phase(channelId, now());
      const slot = mode === "ambient" ? await dependencies.material.ambient(channelId) : await dependencies.material.canonical(channelId);
      await dependencies.queue.stage(slot);
      await dependencies.queue.release(slot.key);
      const checkpoint: ProductionCheckpoint = { channelId, desired: "running", mode, slotKey: slot.key };
      await dependencies.journal.save(checkpoint);
      return checkpoint;
    },
    async stop(channelId) {
      const checkpoint: ProductionCheckpoint = { channelId, desired: "stopped", mode: "stopped" };
      await dependencies.journal.save(checkpoint);
    },
  };
}

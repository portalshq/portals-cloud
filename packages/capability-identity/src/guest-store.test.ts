import { describe, expect, it } from "vitest";
import { GuestUsageStore, MAX_GUEST_TRIAL_REACTIONS } from "./guest-store.js";
import type { QueryRunner } from "./postgres-store.js";

/** In-memory fake that mirrors the `guest_trial_usage`/`guest_trial_claims`
 *  SQL semantics the store relies on. */
function makePool() {
  const usage = new Map<string, { voted: boolean; reactions: number }>();
  const claims = new Map<string, string>();
  const calls: Array<{ text: string; values?: unknown[] }> = [];
  const pool: QueryRunner = {
    async query(text: string, values: unknown[] = []) {
      calls.push({ text, values });
      const guestId = values[0] as string;
      if (text.includes("guest_trial_claims")) {
        if (claims.has(guestId)) return { rowCount: 0, rows: [] };
        claims.set(guestId, values[1] as string);
        return { rowCount: 1, rows: [{ guest_id: guestId }] };
      }
      const row = usage.get(guestId) ?? { voted: false, reactions: 0 };
      if (text.startsWith("UPDATE guest_trial_usage SET vote_used_at = NULL")) {
        usage.set(guestId, { ...row, voted: false });
        return { rowCount: 1, rows: [] };
      }
      if (text.startsWith("UPDATE guest_trial_usage SET reaction_count")) {
        usage.set(guestId, { ...row, reactions: Math.max(row.reactions - 1, 0) });
        return { rowCount: 1, rows: [] };
      }
      if (text.startsWith("SELECT vote_used_at")) {
        return { rowCount: row.voted ? 1 : 0, rows: row.voted ? [{ used: true }] : [] };
      }
      if (text.includes("vote_used_at")) {
        if (row.voted) return { rowCount: 0, rows: [] };
        usage.set(guestId, { ...row, voted: true });
        return { rowCount: 1, rows: [{ guest_id: guestId }] };
      }
      const max = values[1] as number;
      if (row.reactions >= max) return { rowCount: 0, rows: [] };
      usage.set(guestId, { ...row, reactions: row.reactions + 1 });
      return { rowCount: 1, rows: [{ guest_id: guestId }] };
    },
  };
  return { pool, calls };
}

describe("GuestUsageStore", () => {
  it("awards the one-ever vote exactly once and releases it on failure", async () => {
    const { pool } = makePool();
    const store = new GuestUsageStore(pool);
    expect(await store.claimVote("g1")).toBe(true);
    expect(await store.claimVote("g1")).toBe(false);
    expect(await store.claimVote("g2")).toBe(true);
    await store.releaseVote("g1");
    expect(await store.claimVote("g1")).toBe(true);
  });

  it("caps reactions at the allowance and releases failed claims", async () => {
    const { pool } = makePool();
    const store = new GuestUsageStore(pool);
    expect(await store.claimReaction("g1")).toBe(true);
    await store.releaseReaction("g1");
    for (let i = 0; i < MAX_GUEST_TRIAL_REACTIONS; i += 1) {
      expect(await store.claimReaction("g1")).toBe(true);
    }
    expect(await store.claimReaction("g1")).toBe(false);
    // Releasing at zero never goes negative.
    await store.releaseReaction("g2");
    await store.releaseReaction("g2");
    expect(await store.claimReaction("g2")).toBe(true);
  });

  it("keeps the vote independent of reactions", async () => {
    const { pool } = makePool();
    const store = new GuestUsageStore(pool);
    for (let i = 0; i < MAX_GUEST_TRIAL_REACTIONS; i += 1) {
      expect(await store.claimReaction("g1")).toBe(true);
    }
    expect(await store.claimVote("g1")).toBe(true);
    expect(await store.claimReaction("g1")).toBe(false);
  });

  it("reports whether the one-ever vote was spent", async () => {
    const { pool } = makePool();
    const store = new GuestUsageStore(pool);
    expect(await store.voteUsed("g1")).toBe(false);
    await store.claimVote("g1");
    expect(await store.voteUsed("g1")).toBe(true);
    await store.releaseVote("g1");
    expect(await store.voteUsed("g1")).toBe(false);
  });

  it("records an upgrade claim exactly once across instances", async () => {
    const { pool } = makePool();
    // Two store instances share the pool — the durable row is the dedupe.
    const first = new GuestUsageStore(pool);
    const second = new GuestUsageStore(pool);
    expect(await first.claimUpgrade("guest-1", "user-1")).toBe(true);
    expect(await second.claimUpgrade("guest-1", "user-2")).toBe(false);
    expect(await first.claimUpgrade("guest-2", "user-1")).toBe(true);
  });
});

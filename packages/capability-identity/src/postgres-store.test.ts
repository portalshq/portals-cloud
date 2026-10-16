import { describe, expect, it } from "vitest";
import { INACTIVE_ACCOUNT_ERROR } from "./identity-provider.js";
import { PostgresIdentityStore, type QueryRunner } from "./postgres-store.js";

type Call = { text: string; values?: unknown[] };

function runner(result: { rowCount?: number | null; rows?: Array<Record<string, unknown>> } = {}): {
  calls: Call[];
  pool: QueryRunner;
} {
  const calls: Call[] = [];
  return {
    calls,
    pool: {
      query: async (text: string, values?: unknown[]) => {
        calls.push({ text, values });
        return { rowCount: result.rowCount ?? null, rows: result.rows ?? [] };
      },
    },
  };
}

describe("PostgresIdentityStore", () => {
  it("maps an active application user", async () => {
    const { pool, calls } = runner({ rows: [{ id: "user-1", display_name: "Ada" }] });

    await expect(new PostgresIdentityStore(pool).getIdentity("user-1")).resolves.toEqual({
      userId: "user-1",
      displayName: "Ada",
    });
    expect(calls[0].text).toContain("status = 'active'");
    expect(calls[0].values).toEqual(["user-1"]);
  });

  it("returns no identity for an unknown or suspended account", async () => {
    const { pool } = runner({ rows: [] });
    await expect(new PostgresIdentityStore(pool).getIdentity("user-2")).resolves.toBeUndefined();
  });

  it("stamps interactions from the transaction clock, not the caller", async () => {
    const { pool, calls } = runner({ rowCount: 1 });

    await new PostgresIdentityStore(pool).recordInteraction("user-1", { channelId: "c1", sessionId: "s1" });

    expect(calls[0].text).toContain("now()");
    expect(calls[0].text).toContain("EXISTS");
    expect(calls[0].values).toEqual(["user-1", "c1", "s1"]);
  });

  it("refuses to write when the account is no longer active", async () => {
    const { pool } = runner({ rowCount: 0 });
    await expect(
      new PostgresIdentityStore(pool).recordInteraction("user-2", { channelId: "c1", sessionId: "s1" }),
    ).rejects.toThrow(INACTIVE_ACCOUNT_ERROR);
  });

  it("bounds and normalizes history reads", async () => {
    const { pool, calls } = runner({
      rows: [
        { channel_id: "c1", session_id: "s1", last_interaction_at: new Date("2026-10-15T12:00:00.000Z") },
        { channel_id: "c2", session_id: "s2", last_interaction_at: "2026-10-14T12:00:00.000Z" },
      ],
    });

    await expect(new PostgresIdentityStore(pool).getHistory("user-1", 25)).resolves.toEqual([
      { channelId: "c1", sessionId: "s1", lastInteractionAt: "2026-10-15T12:00:00.000Z" },
      { channelId: "c2", sessionId: "s2", lastInteractionAt: "2026-10-14T12:00:00.000Z" },
    ]);
    expect(calls[0].text).toContain("LIMIT $2");
    expect(calls[0].values).toEqual(["user-1", 25]);
  });
});

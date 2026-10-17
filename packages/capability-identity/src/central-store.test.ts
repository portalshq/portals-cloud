import { describe, expect, it, vi } from "vitest";
import { CentralIdentityStore } from "./central-store.js";
import { IdentityProvider, INACTIVE_ACCOUNT_ERROR } from "./identity-provider.js";
import { runCentralMigrations } from "./migrations.js";

function db(rows: Record<string, unknown>[] = [], rowCount: number | null = 1) {
  return { query: vi.fn(async (_text: string, _values?: unknown[]) => ({ rows, rowCount })) };
}
describe("central store", () => {
  it("maps identity and preferences", async () => {
    const store = new CentralIdentityStore(db([{ id: "u", display_name: "Ada", email: "a@example.test", preferences: { theme: "dark" } }]));
    expect(await store.getIdentity("u")).toEqual({ userId: "u", displayName: "Ada", email: "a@example.test", preferences: { theme: "dark" } });
    expect(await new CentralIdentityStore(db([{ id: "u", display_name: "Ada" }])).getIdentity("u")).toEqual({ userId: "u", displayName: "Ada", email: undefined, preferences: undefined });
    expect(await new CentralIdentityStore(db()).getIdentity("u")).toBeUndefined();
  });
  it("writes active history and maps ordered results", async () => {
    const connection = db([{ channel_id: "c", session_id: "s", last_interaction_at: new Date("2026-01-01Z") }]);
    const store = new CentralIdentityStore(connection);
    await store.recordInteraction("u", { channelId: "c", sessionId: "s" });
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining("GREATEST"), ["u", "c", "s"]);
    expect(await store.getHistory("u", 5)).toEqual([{ channelId: "c", sessionId: "s", lastInteractionAt: "2026-01-01T00:00:00.000Z" }]);
    await expect(new CentralIdentityStore(db([], 0)).recordInteraction("u", { channelId: "c", sessionId: "s" })).rejects.toThrow(INACTIVE_ACCOUNT_ERROR);
  });
  it("retains the existing update-only interface", async () => {
    const connection = db();
    await new CentralIdentityStore(connection).updateUserInfo("u", "Ada");
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE users"), ["u", "Ada"]);
  });
});
describe("soft references", () => {
  const provider = new IdentityProvider(async () => "u", new CentralIdentityStore(db()));
  it("allows only the registry tables and parameterizes keys", async () => {
    for (const table of ["users", "channel_apps", "channel_schedules"]) {
      const connection = db();
      expect(await provider.validateSoftKey(table, "' OR true", connection)).toBe(true);
      expect(connection.query).toHaveBeenCalledWith(expect.stringContaining("WHERE id = $1"), ["' OR true"]);
    }
    const connection = db();
    await expect(provider.validateSoftKey("users; DROP TABLE users", "u", connection)).rejects.toThrow("Invalid table");
    expect(connection.query).not.toHaveBeenCalled();
  });
  it("fails closed on missing rows, null counts and database failures", async () => {
    expect(await provider.validateSoftKey("users", "u", db([], 0))).toBe(false);
    expect(await provider.validateSoftKey("users", "u", db([], null))).toBe(false);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await provider.validateSoftKey("users", "u", { query: async () => { throw new Error("offline"); } })).toBe(false);
    } finally { log.mockRestore(); }
  });
});
describe("central provisioning", () => {
  it("ships an atomic migration with concurrency serialization", async () => {
    const connection = db();
    await runCentralMigrations(connection);
    expect(connection.query).toHaveBeenCalledOnce();
    const sql = connection.query.mock.calls[0][0];
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS users");
    expect(sql).toContain("END $identity_migration$");
  });
  it("propagates provisioning errors", async () => {
    await expect(runCentralMigrations({ query: async () => { throw new Error("DDL denied"); } })).rejects.toThrow("DDL denied");
  });
});

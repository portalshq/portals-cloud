import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INACTIVE_ACCOUNT_ERROR } from "./identity-provider.js";
import { PostgresIdentityStore } from "./postgres-store.js";

/**
 * Exercises the real migration and SQL against PostgreSQL. Set
 * IDENTITY_TEST_DATABASE_URL to a scratch database; the suite is skipped
 * without it. It drops and recreates its own tables only.
 */
const url = process.env.IDENTITY_TEST_DATABASE_URL;
const migration = readFileSync(
  fileURLToPath(new URL("../../../frontend/migrations/015_application_user_channel_history.sql", import.meta.url)),
  "utf8",
);

describe.skipIf(!url)("PostgresIdentityStore against PostgreSQL", () => {
  const pool = new Pool({ connectionString: url });
  const store = new PostgresIdentityStore(pool);

  beforeAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS application_user_channel_history`);
    await pool.query(`DROP TABLE IF EXISTS application_users`);
    await pool.query(`CREATE TABLE application_users (
      id text PRIMARY KEY, display_name text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'active')`);
    await pool.query(`INSERT INTO application_users (id, display_name, status) VALUES
      ('user-1', 'Ada', 'active'), ('user-2', 'Bob', 'suspended')`);
    await pool.query(migration);
  });

  afterAll(async () => {
    await pool.query("DROP TABLE IF EXISTS application_user_channel_history");
    await pool.query("DROP TABLE IF EXISTS application_users");
    await pool.end();
  });

  it("applies the migration idempotently", async () => {
    await expect(pool.query(migration)).resolves.toBeTruthy();
  });

  it("rejects an oversized soft identifier at the database boundary", async () => {
    await expect(
      store.recordInteraction("user-1", { channelId: "c".repeat(129), sessionId: "s1" }),
    ).rejects.toThrow();
  });

  it("rejects history for an unknown user", async () => {
    await expect(
      store.recordInteraction("nobody", { channelId: "c1", sessionId: "s1" }),
    ).rejects.toThrow();
  });

  it("writes history for an active user and keeps the newest interaction", async () => {
    await store.recordInteraction("user-1", { channelId: "c1", sessionId: "s1" });
    const first = await store.getHistory("user-1", 10);
    expect(first).toHaveLength(1);
    expect(new Date(first[0].lastInteractionAt).getTime()).toBeLessThanOrEqual(Date.now());

    await pool.query(
      `UPDATE application_user_channel_history SET last_interaction_at = now() - interval '1 hour'`);
    await store.recordInteraction("user-1", { channelId: "c1", sessionId: "s1" });

    const [entry] = await store.getHistory("user-1", 10);
    expect(new Date(entry.lastInteractionAt).getTime()).toBeGreaterThan(
      new Date(first[0].lastInteractionAt).getTime() - 60_000,
    );
    expect(await store.getHistory("user-1", 10)).toHaveLength(1);
  });

  it("refuses to write history for a suspended account", async () => {
    await expect(
      store.recordInteraction("user-2", { channelId: "c1", sessionId: "s1" }),
    ).rejects.toThrow(INACTIVE_ACCOUNT_ERROR);
  });

  it("orders and bounds history reads", async () => {
    for (const index of [1, 2, 3]) {
      await store.recordInteraction("user-1", { channelId: `c${index}`, sessionId: `s${index}` });
      await pool.query("SELECT pg_sleep(0.01)");
    }

    expect(await store.getHistory("user-1", 2)).toHaveLength(2);
    const all = await store.getHistory("user-1", 10);
    expect(new Date(all[0].lastInteractionAt).getTime()).toBeGreaterThanOrEqual(
      new Date(all[1].lastInteractionAt).getTime(),
    );
  });

  it("cascades history when an application user is deleted", async () => {
    await store.recordInteraction("user-1", { channelId: "c9", sessionId: "s9" });
    await pool.query("INSERT INTO application_users (id) VALUES ('user-3')");
    await store.recordInteraction("user-3", { channelId: "c9", sessionId: "s9" });

    await pool.query("DELETE FROM application_users WHERE id = 'user-3'");

    const remaining = await pool.query(
      "SELECT count(*)::int AS count FROM application_user_channel_history WHERE user_id = 'user-3'");
    expect(remaining.rows[0].count).toBe(0);
  });
});

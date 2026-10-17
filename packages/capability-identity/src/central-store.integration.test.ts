import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CentralIdentityStore } from "./central-store.js";
import { ApplicationIdentityStore } from "./postgres-store.js";
import { IdentityProvider } from "./identity-provider.js";
import { runCentralMigrations } from "./migrations.js";

const url = process.env.IDENTITY_CENTRAL_TEST_DATABASE_URL;
describe.skipIf(!url)("isolated PostgreSQL central identity", () => {
  const schema = `identity_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url });
  const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  const store = new CentralIdentityStore(pool);
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await runCentralMigrations(pool);
  });
  afterAll(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  });
  it("provisions idempotently, including concurrent calls", async () => {
    await Promise.all([runCentralMigrations(pool), runCentralMigrations(pool)]);
  });
  it("upgrades a legacy schema atomically and refuses ambiguous history", async () => {
    const legacySchema = `${schema}_legacy`;
    await admin.query(`CREATE SCHEMA ${legacySchema}`);
    const legacy = new Pool({ connectionString: url, options: `-c search_path=${legacySchema}` });
    try {
      await legacy.query(`CREATE TABLE users (id text PRIMARY KEY, display_name text NOT NULL,
        email text, idp text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
        CREATE TABLE user_channel_history (id bigserial PRIMARY KEY,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, app_id text NOT NULL,
        channel_id text NOT NULL, session_id text, last_interaction_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(user_id, app_id, channel_id, session_id));
        INSERT INTO users (id, display_name, idp) VALUES ('legacy', 'Ada', 'issuer');
        INSERT INTO user_channel_history (user_id, app_id, channel_id, session_id)
        VALUES ('legacy','a','c','s'), ('legacy','b','c','s');`);
      await expect(runCentralMigrations(legacy)).rejects.toThrow();
      // Failure must roll back all DDL and release the connection without an open transaction.
      const columns = await legacy.query(`SELECT column_name FROM information_schema.columns
        WHERE table_schema=$1 AND table_name='users' AND column_name='status'`, [legacySchema]);
      expect(columns.rows).toEqual([]);
      await legacy.query("UPDATE user_channel_history SET session_id='s2' WHERE app_id='b'");
      await runCentralMigrations(legacy);
      const upgraded = new CentralIdentityStore(legacy);
      await upgraded.syncFromAuthGateway("legacy", "Updated");
      await upgraded.recordInteraction("legacy", { channelId: "new", sessionId: "s" });
      expect(await upgraded.getHistory("legacy", 10)).toHaveLength(3);
      await expect(upgraded.recordInteraction("legacy", { channelId: "new", sessionId: "" })).rejects.toThrow();
    } finally {
      await legacy.end();
      await admin.query(`DROP SCHEMA ${legacySchema} CASCADE`);
    }
  });
  it("syncs, preserves local fields and suspension, reads preferences", async () => {
    await store.syncFromAuthGateway("u", "Ada");
    await pool.query("UPDATE users SET email='a@example.test', status='suspended' WHERE id='u'");
    await store.syncFromAuthGateway("u", "New name");
    expect(await store.getIdentity("u")).toBeUndefined();
    await expect(store.recordInteraction("u", { channelId: "c", sessionId: "s" })).rejects.toThrow();
    await pool.query("UPDATE users SET status='active' WHERE id='u'");
    await pool.query("INSERT INTO user_preferences (user_id, key, value) VALUES ('u', 'theme', '\"dark\"')");
    expect(await store.getIdentity("u")).toEqual({ userId: "u", displayName: "New name", email: "a@example.test", preferences: { theme: "dark" } });
  });
  it("upserts history, preserves newer timestamps, bounds reads and cascades", async () => {
    await store.syncFromAuthGateway("history", "Ada");
    await expect(store.recordInteraction("missing", { channelId: "c", sessionId: "s" })).rejects.toThrow();
    await expect(store.recordInteraction("history", { channelId: " ", sessionId: "s" })).rejects.toThrow();
    await store.recordInteraction("history", { channelId: "c", sessionId: "s" });
    await pool.query("UPDATE user_channel_history SET last_interaction_at = now() + interval '1 hour' WHERE user_id='history'");
    await store.recordInteraction("history", { channelId: "c", sessionId: "s" });
    expect(await store.getHistory("history", 5)).toHaveLength(1);
    expect(Date.parse((await store.getHistory("history", 1))[0].lastInteractionAt)).toBeGreaterThan(Date.now());
    await store.recordInteraction("history", { channelId: "c2", sessionId: "s" });
    expect(await store.getHistory("history", 1)).toHaveLength(1);
    await pool.query("DELETE FROM users WHERE id='history'");
    expect(await store.getHistory("history", 5)).toEqual([]);
  });
  it("syncs the real application schema without requiring unavailable upstream fields", async () => {
    await pool.query(`CREATE TABLE application_users (
      id text PRIMARY KEY, email_hash text NOT NULL UNIQUE, identity_ciphertext text NOT NULL,
      display_name text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'active', updated_at timestamptz NOT NULL DEFAULT now())`);
    await pool.query("INSERT INTO application_users (id, email_hash, identity_ciphertext, status) VALUES ('app-user', 'hash', 'cipher', 'suspended')");
    const app = new ApplicationIdentityStore(pool);
    const provider = new IdentityProvider(async () => "app-user", app);
    await provider.syncFromAuthGateway("app-user", { getUserInfo: async () => ({ userId: "app-user", displayName: "Ada" }) }, "app");
    expect(await app.getIdentity("app-user")).toBeUndefined();
    const { rows } = await pool.query("SELECT * FROM application_users WHERE id='app-user'");
    expect(rows[0]).toMatchObject({ display_name: "Ada", email_hash: "hash", identity_ciphertext: "cipher", status: "suspended" });
    await expect(app.syncFromAuthGateway("unknown", "Ada")).rejects.toThrow("provisioned");
  });
  it("validates soft keys against the real registry", async () => {
    const provider = new IdentityProvider(async () => "u", store);
    expect(await provider.validateSoftKey("users", "u", pool)).toBe(true);
    expect(await provider.validateSoftKey("users", "missing", pool)).toBe(false);
  });
});

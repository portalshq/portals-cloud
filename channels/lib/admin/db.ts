/**
 * Lazy pg pools for the admin API.
 *
 * Two databases back the admin surface:
 *   - appDb:     the bears-live-app application database
 *   - centralDb: the central platform database (stations, schedule rules, slots)
 *
 * Pools are created per process on first use. Vercel serverless means one warm
 * pool per lambda instance — an admin tool is low-traffic, so `max` stays small.
 */

import pg from "pg";
import { adminEnv } from "./env";
import { serviceUnavailable } from "./http";

const POOL_OPTIONS: pg.PoolConfig = {
  max: 2,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
  allowExitOnIdle: true,
};

type DatabaseScope = "APP" | "CENTRAL";

function pem(value: string | undefined): string | undefined {
  return value?.replaceAll("\\n", "\n").trim() || undefined;
}

/** Build a bounded pool for Neon or an explicitly mTLS-protected Postgres endpoint. */
export function databasePoolConfig(
  value: string,
  scope: DatabaseScope,
  env: NodeJS.ProcessEnv = process.env,
): pg.PoolConfig {
  const host = new URL(value).hostname;
  const ca = pem(env[`${scope}_DATABASE_SSL_CA`]);
  const cert = pem(env[`${scope}_DATABASE_SSL_CERT`]);
  const key = pem(env[`${scope}_DATABASE_SSL_KEY`]);
  const hasTlsMaterial = Boolean(ca || cert || key);
  if (hasTlsMaterial && (!ca || !cert || !key)) {
    throw serviceUnavailable(`${scope} database TLS requires CA, client certificate, and client key`);
  }
  const isNeon = host.endsWith(".neon.tech");
  // if (env.NODE_ENV === "production" && isNeon && !host.includes("-pooler")) {
  //   throw serviceUnavailable("Application traffic requires a pooled Neon database URL");
  // }
  if (env.NODE_ENV === "production" && !isNeon && !hasTlsMaterial) {
    throw serviceUnavailable(`${scope} non-Neon database requires mTLS environment variables`);
  }
  return {
    connectionString: value,
    ...POOL_OPTIONS,
    ...(hasTlsMaterial ? { ssl: { ca, cert, key, rejectUnauthorized: true } } : {}),
  };
}

let poolAppDb: pg.Pool | null = null;
let poolCentralDb: pg.Pool | null = null;

export function appDb(): pg.Pool {
  if (poolAppDb) return poolAppDb;
  const { appDatabaseUrl } = adminEnv();
  if (!appDatabaseUrl) {
    throw serviceUnavailable("Admin app database is not configured");
  }
  if (appDatabaseUrl === adminEnv().centralDatabaseUrl) return centralDb();
  poolAppDb = new pg.Pool(databasePoolConfig(appDatabaseUrl, "APP"));
  poolAppDb.on("error", (error) => console.error("[channels] App database connection lost", error.message));
  return poolAppDb;
}

export function centralDb(): pg.Pool {
  if (poolCentralDb) return poolCentralDb;
  const { centralDatabaseUrl } = adminEnv();
  if (!centralDatabaseUrl) {
    throw serviceUnavailable("Admin central database is not configured");
  }
  poolCentralDb = new pg.Pool(databasePoolConfig(centralDatabaseUrl, "CENTRAL"));
  poolCentralDb.on("error", (error) => console.error("[channels] Central database connection lost", error.message));
  return poolCentralDb;
}

/**
 * Test seam: inject fake pools so route handlers can be exercised without a
 * live Postgres. Pass null to reset to env-backed laziness.
 */
export function setPoolsForTest(pools: { app?: pg.Pool | null; central?: pg.Pool | null }): void {
  if ("app" in pools) poolAppDb = pools.app ?? null;
  if ("central" in pools) poolCentralDb = pools.central ?? null;
}

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
};

let poolAppDb: pg.Pool | null = null;
let poolCentralDb: pg.Pool | null = null;

export function appDb(): pg.Pool {
  if (poolAppDb) return poolAppDb;
  const { appDatabaseUrl } = adminEnv();
  if (!appDatabaseUrl) {
    throw serviceUnavailable("Admin app database is not configured");
  }
  poolAppDb = new pg.Pool({ connectionString: appDatabaseUrl, ...POOL_OPTIONS });
  return poolAppDb;
}

export function centralDb(): pg.Pool {
  if (poolCentralDb) return poolCentralDb;
  const { centralDatabaseUrl } = adminEnv();
  if (!centralDatabaseUrl) {
    throw serviceUnavailable("Admin central database is not configured");
  }
  poolCentralDb = new pg.Pool({ connectionString: centralDatabaseUrl, ...POOL_OPTIONS });
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

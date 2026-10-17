import { readFile } from "node:fs/promises";
import type { QueryRunner } from "./postgres-store.js";

/** Apply on a dedicated central database. A single query is one atomic transaction.
 * Safe to rerun; an advisory transaction lock serializes concurrent provisioning.
 * Never run on an application database.
 */
export async function runCentralMigrations(pool: QueryRunner): Promise<void> {
  const sql = await readFile(new URL("../sql/001_central_identity.sql", import.meta.url), "utf8");
  await pool.query(`DO $identity_migration$ BEGIN
PERFORM pg_advisory_xact_lock(761830214);
${sql}
END $identity_migration$;`);
}

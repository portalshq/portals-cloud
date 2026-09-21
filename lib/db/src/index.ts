import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function connectionString(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    )
  }
  return url
}

let _pool: InstanceType<typeof Pool> | null = null
export function getPool(): InstanceType<typeof Pool> {
  if (!_pool) _pool = new Pool({ connectionString: connectionString() })
  return _pool
}

let _db: ReturnType<typeof drizzle> | null = null
export function getDb(): ReturnType<typeof drizzle> {
  if (!_db) _db = drizzle(getPool(), { schema })
  return _db
}

// Lazy proxies preserve `import { db, pool }` shape without throwing at import.
// ponytail: import-time throw broke typecheck/tests without env; throw on first use instead.
export const pool = new Proxy({} as InstanceType<typeof Pool>, {
  get(_t, prop) {
    const real = getPool() as unknown as Record<string | symbol, unknown>
    const value = real[prop as string]
    return typeof value === 'function' ? (value as Function).bind(real) : value
  },
}) as InstanceType<typeof Pool>

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>
    const value = real[prop as string]
    return typeof value === 'function' ? (value as Function).bind(real) : value
  },
}) as ReturnType<typeof drizzle>

export * from "./schema";

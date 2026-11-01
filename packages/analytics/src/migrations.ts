/** Minimal pg-compatible seam; the connector accepts pg.Pool or a test double. */
export interface MigrationDatabase {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/** One versioned step. Statements must be idempotent so a restarted or
 *  concurrent runner applies them safely; the version row is the record that
 *  the step completed, not the guard that makes it safe. */
export interface AnalyticsMigration {
  version: number;
  name: string;
  statements: readonly string[];
}

/** Mirrors sql/001_analytics_delivery.sql. Keep both in sync. */
const MIGRATIONS: readonly AnalyticsMigration[] = [
  {
    version: 1,
    name: "analytics_delivery",
    statements: [
      `CREATE TABLE IF NOT EXISTS portals_analytics_delivery (
        destination text NOT NULL,
        kind text NOT NULL CHECK (kind IN ('billing', 'interaction')),
        source_id text NOT NULL,
        state text NOT NULL DEFAULT 'pending'
          CHECK (state IN ('pending', 'delivered', 'excluded', 'blocked', 'dead')),
        attempts integer NOT NULL DEFAULT 0,
        next_attempt_at timestamptz NOT NULL DEFAULT now(),
        claimed_by text,
        claim_token text,
        claimed_until timestamptz,
        last_failure_category text,
        delivered_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (destination, kind, source_id)
      )`,
      `CREATE INDEX IF NOT EXISTS portals_analytics_delivery_ready_idx
        ON portals_analytics_delivery(destination, next_attempt_at)
        WHERE state = 'pending'`,
      `CREATE INDEX IF NOT EXISTS portals_analytics_delivery_source_idx
        ON portals_analytics_delivery(kind, source_id)`,
      `CREATE TABLE IF NOT EXISTS portals_analytics_discovery (
        destination text NOT NULL,
        kind text NOT NULL CHECK (kind IN ('billing', 'interaction')),
        through timestamptz NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (destination, kind)
      )`,
    ],
  },
];

/** Columns the connector reads from each business-owned outbox. A missing
 *  relation or column means the owning package's migrations were not applied;
 *  the connector must report that instead of failing obscurely at poll time. */
export const REQUIRED_SOURCE_COLUMNS = {
  billing: { relation: "monetization_outbox", columns: ["id", "type", "payload", "created_at"] },
  interaction: { relation: "interaction_outbox", columns: ["id", "world_id", "event_type", "payload", "occurred_at", "created_at"] },
} as const;

export type SourceKind = keyof typeof REQUIRED_SOURCE_COLUMNS;

/** Applies pending migrations. Safe to restart and safe to run concurrently:
 *  every statement is idempotent and the version insert tolerates conflicts. */
export async function runMigrations(db: MigrationDatabase): Promise<void> {
  await db.query(`CREATE TABLE IF NOT EXISTS portals_analytics_migrations (
    version integer PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  for (const migration of MIGRATIONS) {
    const applied = await db.query(
      "SELECT version FROM portals_analytics_migrations WHERE version = $1",
      [migration.version],
    );
    if (applied.rows.length) continue;
    for (const statement of migration.statements) await db.query(statement);
    await db.query(
      "INSERT INTO portals_analytics_migrations(version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
      [migration.version],
    );
  }
}

/** Verifies required business source relations and columns exist. Throws a
 *  descriptive configuration error naming what is missing. */
export async function validateSourceSchema(db: MigrationDatabase, kinds: readonly SourceKind[]): Promise<void> {
  const missing: string[] = [];
  for (const kind of kinds) {
    const { relation, columns } = REQUIRED_SOURCE_COLUMNS[kind];
    const relationCheck = await db.query("SELECT to_regclass($1) AS relation", [relation]);
    if (!relationCheck.rows[0]?.relation) {
      missing.push(`${relation} (apply the owning package's migrations)`);
      continue;
    }
    const columnCheck = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`,
      [relation],
    );
    const present = new Set(columnCheck.rows.map(row => String(row.column_name)));
    for (const column of columns) {
      if (!present.has(column)) missing.push(`${relation}.${column}`);
    }
  }
  if (missing.length) {
    throw new Error(`Analytics source schema is incomplete: missing ${missing.join(", ")}`);
  }
}

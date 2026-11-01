import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it, vi } from 'vitest'
import { AnalyticsConnector } from '../src/connector.js'
import { runMigrations, validateSourceSchema } from '../src/migrations.js'

const MONETIZATION_SQL = readFileSync(new URL('../../monetization/sql/001_monetization.sql', import.meta.url), 'utf8')
const LIFECYCLE_SQL = [
  readFileSync(new URL('../../capability-interaction-orchestrator/sql/001_interaction_orchestrator_core.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../../capability-interaction-orchestrator/sql/002_durable_lifecycle.sql', import.meta.url), 'utf8'),
].join(';\n')

async function database(sql = '') {
  const db = new PGlite()
  if (sql) await db.exec(sql)
  const query = async (text: string, params?: unknown[]) => ({ rows: (await db.query<Record<string, unknown>>(text, params)).rows })
  return { db, query }
}

describe('source schema validation against real package migrations', () => {
  it('accepts the actual monetization and interaction outbox contracts', async () => {
    const { db, query } = await database(`${MONETIZATION_SQL};\n${LIFECYCLE_SQL}`)
    try {
      await expect(validateSourceSchema({ query }, ['billing', 'interaction'])).resolves.toBeUndefined()
      const connector = new AnalyticsConnector({
        db: { query }, sink: { send: vi.fn() }, destination: 'segment', appId: 'app',
        startAt: '2026-01-01T00:00:00Z', authorizeTenant: async () => true,
        resolveWorld: async () => 'tenant', resolveInteractionIdentity: async () => ({ userId: 'u' }),
      })
      await expect(connector.start()).resolves.toBeUndefined()
      await connector.stop()
      // The durable lifecycle migration (occurred_at, claim columns) is required.
      const columns = await query("SELECT column_name FROM information_schema.columns WHERE table_name='interaction_outbox'")
      for (const column of ['world_id', 'created_at', 'occurred_at']) {
        expect(columns.rows.map(row => row.column_name)).toContain(column)
      }
    } finally { await db.close() }
  }, 30_000)

  it('reports a missing source migration clearly', async () => {
    const { db, query } = await database(MONETIZATION_SQL)
    try {
      await expect(validateSourceSchema({ query }, ['interaction'])).rejects.toThrow(/interaction_outbox.*migrations/)
    } finally { await db.close() }
  }, 20_000)

  it('reports a missing required column clearly', async () => {
    const { db, query } = await database(`${MONETIZATION_SQL};\n${LIFECYCLE_SQL}`)
    try {
      // An unmigrated database lacks the 002 durable-lifecycle columns.
      await db.exec('ALTER TABLE interaction_outbox DROP COLUMN occurred_at')
      await expect(validateSourceSchema({ query }, ['interaction'])).rejects.toThrow(/interaction_outbox\.occurred_at/)
    } finally { await db.close() }
  }, 30_000)

  it('runs package migrations idempotently and concurrently', async () => {
    const { db, query } = await database()
    try {
      await Promise.all([runMigrations({ query }), runMigrations({ query })])
      await runMigrations({ query })
      const applied = await query('SELECT version FROM portals_analytics_migrations')
      expect(applied.rows).toEqual([{ version: 1 }])
      const tables = await query("SELECT to_regclass('portals_analytics_delivery') d, to_regclass('portals_analytics_discovery') w")
      expect(tables.rows[0]).toEqual({ d: 'portals_analytics_delivery', w: 'portals_analytics_discovery' })
    } finally { await db.close() }
  }, 20_000)
})

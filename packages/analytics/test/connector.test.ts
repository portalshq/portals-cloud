import { PGlite } from '@electric-sql/pglite'
import { it, expect, vi, describe } from 'vitest'
import { AnalyticsConnector } from '../src/connector.js'

const BILLING_TABLE = `CREATE TABLE monetization_outbox (id text PRIMARY KEY,type text,payload jsonb,created_at timestamptz,delivered_at timestamptz)`
const INTERACTION_TABLE = `CREATE TABLE interaction_outbox (id text PRIMARY KEY,world_id text,event_type text,payload jsonb,sequence integer,created_at timestamptz,occurred_at timestamptz,published_at timestamptz)`
const SETTLED = (id: string, tenant = 'tenant', buyer: string | null = 'user', created = '2026-06-01T00:00:00Z') =>
  `INSERT INTO monetization_outbox VALUES ('${id}','billing.purchase_settled','{"tenantId":"${tenant}",${buyer ? `"buyerId":"${buyer}",` : ''}"amount":100,"refundedAmount":0,"currency":"usd"}','${created}',NULL)`
const INTERACTION = (id: string, type = 'resolution_committed', world = 'world-1', created = '2026-06-01T00:00:00Z', occurred = '2026-05-30T00:00:00Z') =>
  `INSERT INTO interaction_outbox VALUES ('${id}','${world}','${type}','{"private":"data"}',1,'${created}','${occurred}',NULL)`

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }
async function database(...statements: string[]) {
  const db = new PGlite()
  if (statements.length) await db.exec(statements.join(';\n'))
  const query: Db['query'] = async (sql, params) => ({ rows: (await db.query<Record<string, unknown>>(sql, params)).rows })
  return { db, query }
}
const options = (query: Db['query'], overrides: Record<string, unknown> = {}) => ({
  db: { query }, sink: { send: vi.fn().mockResolvedValue(undefined) }, destination: 'segment', appId: 'app',
  startAt: '2026-05-01T00:00:00Z', authorizeTenant: async (t: string) => t === 'tenant',
  ...overrides,
})
const state = (query: Db['query'], id: string) =>
  query('SELECT state,attempts,last_failure_category FROM portals_analytics_delivery WHERE source_id=$1', [id]).then(r => r.rows[0])

describe('analytics connector', () => {
  it('discovers committed records, retries with stable namespaced IDs, and never changes business acknowledgments', async () => {
    const { db, query } = await database(BILLING_TABLE, SETTLED('a'))
    try {
      const send = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
      const connector = new AnalyticsConnector(options(query, { sink: { send } }))
      expect((await connector.drainOnce()).failed).toBe(1)
      expect((await query('SELECT delivered_at FROM monetization_outbox')).rows[0]!.delivered_at).toBeNull()
      await db.exec('UPDATE portals_analytics_delivery SET next_attempt_at=now()')
      expect((await connector.drainOnce()).delivered).toBe(1)
      expect(send.mock.calls[0][0][0].id).toBe(send.mock.calls[1][0][0].id)
      expect(send.mock.calls[0][0][0].id).toBe('portals-analytics:app:tenant:billing:a')
      expect(send.mock.calls[0][0][0].properties).toMatchObject({ portals_source_id: 'a', portals_source_kind: 'billing' })
      expect(send.mock.calls[0][0][0].attribution).toEqual({ tenantId: 'tenant', appId: 'app' })
      expect((await connector.drainOnce()).delivered).toBe(0)
    } finally { await db.close() }
  }, 20_000)

  it('introduces only records inserted at or after the launch cutoff', async () => {
    const { db, query } = await database(BILLING_TABLE, SETTLED('before', 'tenant', 'user', '2026-04-01T00:00:00Z'), SETTLED('after'))
    try {
      const send = vi.fn().mockResolvedValue(undefined)
      const connector = new AnalyticsConnector(options(query, { sink: { send } }))
      expect((await connector.drainOnce()).delivered).toBe(1)
      expect(send.mock.calls[0][0][0].id).toContain(':billing:after')
      // The pre-cutoff row is never discovered, even on later drains.
      expect((await connector.drainOnce()).delivered).toBe(0)
      expect((await query("SELECT count(*)::int c FROM portals_analytics_delivery WHERE source_id='before'")).rows[0]!.c).toBe(0)
    } finally { await db.close() }
  }, 20_000)

  it('finds late commits inside the discovery overlap', async () => {
    const { db, query } = await database(BILLING_TABLE, SETTLED('first'), SETTLED('second', 'tenant', 'user', '2026-06-02T00:00:00Z'))
    try {
      const send = vi.fn().mockResolvedValue(undefined)
      const connector = new AnalyticsConnector(options(query, { sink: { send }, discoveryOverlapMs: 3_600_000 }))
      await connector.drainOnce()
      // A transaction that began before the watermark but commits now inserts an older created_at.
      await db.exec(SETTLED('late', 'tenant', 'user', '2026-06-02T00:00:00Z'))
      expect((await connector.drainOnce()).delivered).toBe(1)
      expect(send.mock.calls.at(-1)![0][0].id).toContain(':billing:late')
    } finally { await db.close() }
  }, 20_000)

  it('blocks unauthorized tenants and missing identity instead of sending', async () => {
    const { db, query } = await database(BILLING_TABLE, SETTLED('other-tenant', 'stranger'), SETTLED('no-buyer', 'tenant', null))
    try {
      const send = vi.fn().mockResolvedValue(undefined)
      const connector = new AnalyticsConnector(options(query, { sink: { send } }))
      const result = await connector.drainOnce()
      expect(result.blocked).toBe(2)
      expect(send).not.toHaveBeenCalled()
      expect(await state(query, 'other-tenant')).toMatchObject({ state: 'blocked', last_failure_category: 'invalid_attribution' })
      expect(await state(query, 'no-buyer')).toMatchObject({ state: 'blocked', last_failure_category: 'missing_identity' })
      // Blocked records do not auto-retry; an operator retry re-queues them.
      expect((await connector.drainOnce()).blocked).toBe(0)
      expect(await connector.retryEligible()).toBe(2)
      expect((await connector.drainOnce()).blocked).toBe(2)
    } finally { await db.close() }
  }, 20_000)

  it('excludes unsupported event types and dead-letters malformed or missing sources', async () => {
    const { db, query } = await database(BILLING_TABLE,
      `INSERT INTO monetization_outbox VALUES ('unsupported','billing.other_event','{"tenantId":"tenant"}',now(),NULL)`,
      `INSERT INTO monetization_outbox VALUES ('bad','billing.purchase_settled','{"tenantId":"tenant","buyerId":"u","amount":"NaN","refundedAmount":0,"currency":"usd"}',now(),NULL)`)
    try {
      const connector = new AnalyticsConnector(options(query))
      const result = await connector.drainOnce()
      expect(result).toMatchObject({ excluded: 1, dead: 1 })
      expect(await state(query, 'unsupported')).toMatchObject({ state: 'excluded' })
      expect(await state(query, 'bad')).toMatchObject({ state: 'dead', last_failure_category: 'malformed' })
    } finally { await db.close() }
  }, 20_000)

  it('dead-letters a missing source row found after discovery', async () => {
    const { db, query } = await database(BILLING_TABLE, SETTLED('gone'))
    try {
      const connector = new AnalyticsConnector(options(query))
      // Discover into the ledger, then delete the source row before the claim pass.
      await connector.migrate()
      await connector['discover']('billing')
      await db.exec(`DELETE FROM monetization_outbox WHERE id='gone'`)
      const result = await connector.drainOnce()
      expect(result.dead).toBe(1)
      expect(await state(query, 'gone')).toMatchObject({ state: 'dead', last_failure_category: 'missing_source' })
    } finally { await db.close() }
  }, 20_000)

  it('exhausts retryable failures into dead after maxAttempts', async () => {
    const { db, query } = await database(BILLING_TABLE, SETTLED('a'))
    try {
      const send = vi.fn().mockRejectedValue(new Error('always down'))
      const connector = new AnalyticsConnector(options(query, { sink: { send }, maxAttempts: 2 }))
      expect((await connector.drainOnce()).failed).toBe(1)
      await db.exec('UPDATE portals_analytics_delivery SET next_attempt_at=now()')
      expect((await connector.drainOnce()).dead).toBe(1)
      expect(await state(query, 'a')).toMatchObject({ state: 'dead', last_failure_category: 'retry_exhausted' })
      expect((await connector.drainOnce()).dead).toBe(0)
      expect(send).toHaveBeenCalledTimes(2)
    } finally { await db.close() }
  }, 20_000)

  it('delivers interaction events only with a verified identity and blocks otherwise', async () => {
    const { db, query } = await database(BILLING_TABLE, INTERACTION_TABLE,
      INTERACTION('with-id'), INTERACTION('without-id', 'resolution_failed'))
    try {
      const send = vi.fn().mockResolvedValue(undefined)
      const resolveInteractionIdentity = vi.fn(async (record: Record<string, unknown>) =>
        record.id === 'with-id' ? { userId: 'verified-user' } : undefined)
      const connector = new AnalyticsConnector(options(query, {
        sink: { send }, resolveWorld: async (w: string) => (w === 'world-1' ? 'tenant' : undefined), resolveInteractionIdentity,
      }))
      const result = await connector.drainOnce()
      expect(result).toMatchObject({ delivered: 1, blocked: 1 })
      const message = send.mock.calls[0][0][0]
      expect(message.id).toBe('portals-analytics:app:tenant:interaction:with-id')
      expect(message.occurredAt).toBe('2026-05-30T00:00:00.000Z')
      expect(message.identity).toEqual({ userId: 'verified-user' })
      expect(message.properties).toMatchObject({ portals_source_id: 'with-id', portals_source_kind: 'interaction' })
      expect(JSON.stringify(message)).not.toContain('private')
      expect(await state(query, 'without-id')).toMatchObject({ state: 'blocked', last_failure_category: 'missing_identity' })
      expect((await query('SELECT published_at FROM interaction_outbox')).rows[0]!.published_at).toBeNull()
    } finally { await db.close() }
  }, 20_000)

  it('runs billing-only when no interaction resolver is configured and reports availability', async () => {
    const { db, query } = await database(BILLING_TABLE, INTERACTION_TABLE, SETTLED('a'), INTERACTION('i'))
    try {
      const send = vi.fn().mockResolvedValue(undefined)
      const connector = new AnalyticsConnector(options(query, { sink: { send } }))
      expect((await connector.drainOnce()).delivered).toBe(1)
      expect((await query("SELECT count(*)::int c FROM portals_analytics_delivery WHERE kind='interaction'")).rows[0]!.c).toBe(0)
      const status = await connector.status()
      expect(status.sources).toEqual({ billing: 'enabled', interaction: 'disabled' })
      expect(status.ready).toBe(true)
      expect(status.lastSuccessfulDrain).toBeTruthy()
    } finally { await db.close() }
  }, 20_000)

  it('recovers expired claims after a simulated crash', async () => {
    const { db, query } = await database(BILLING_TABLE, SETTLED('a'), SETTLED('b'))
    try {
      const send = vi.fn().mockResolvedValue(undefined)
      const connector = new AnalyticsConnector(options(query, { sink: { send } }))
      // Simulate a crashed worker: rows claimed with an already-expired lease.
      await connector.migrate()
      await connector['discover']('billing')
      await db.exec(`UPDATE portals_analytics_delivery SET claim_token='dead-worker', claimed_by='dead', claimed_until=now()-interval '1 minute'`)
      expect((await connector.drainOnce()).delivered).toBe(2)
      expect(send).toHaveBeenCalledTimes(2)
    } finally { await db.close() }
  }, 20_000)

  it('lets two connector instances share work under SKIP LOCKED without duplicating ledger rows', async () => {
    const { db, query } = await database(BILLING_TABLE, SETTLED('a'), SETTLED('b'), SETTLED('c'))
    try {
      const sends: string[] = []
      const sink = { send: vi.fn(async (events: { id: string }[]) => { sends.push(events[0]!.id) }) }
      const one = new AnalyticsConnector(options(query, { sink, workerId: 'w1', claimBatchSize: 2 }))
      const two = new AnalyticsConnector(options(query, { sink, workerId: 'w2', claimBatchSize: 2 }))
      await one.drainOnce(); await two.drainOnce()
      expect(new Set(sends).size).toBe(3)
      const counts = await query('SELECT count(*)::int c, count(DISTINCT source_id)::int d FROM portals_analytics_delivery')
      expect(counts.rows[0]).toMatchObject({ c: 3, d: 3 })
    } finally { await db.close() }
  }, 20_000)

  it('stops gracefully and exposes pending age and counts', async () => {
    const { db, query } = await database(BILLING_TABLE, SETTLED('a'))
    try {
      const send = vi.fn(async () => { await new Promise(r => setTimeout(r, 50)) })
      const connector = new AnalyticsConnector(options(query, { sink: { send } }))
      const drain = connector.drainOnce()
      await connector.stop()
      await drain
      const status = await connector.status()
      expect(status.counts.some((row: Record<string, unknown>) => row.state === 'delivered' && row.count === 1)).toBe(true)
    } finally { await db.close() }
  }, 20_000)

  it('fails clearly when a required source migration is absent', async () => {
    const { db, query } = await database(INTERACTION_TABLE)
    try {
      const connector = new AnalyticsConnector(options(query))
      await expect(connector.start()).rejects.toThrow(/monetization_outbox/)
    } finally { await db.close() }
  }, 20_000)

  it('releases claims early when the remaining lease cannot cover another send', async () => {
    const { db, query } = await database(BILLING_TABLE, SETTLED('a'), SETTLED('b'))
    try {
      let calls = 0
      const send = vi.fn(async () => { calls++; await new Promise(r => setTimeout(r, 1200)) })
      const connector = new AnalyticsConnector(options(query, {
        sink: { send }, claimBatchSize: 2, requestTimeoutMs: 1000, claimLeaseMs: 2000,
      }))
      const first = await connector.drainOnce()
      expect(first.delivered).toBe(1)
      // The second record was released rather than sent past its lease; its
      // claim increment was rolled back so the next drain picks it up cleanly.
      expect((await query("SELECT attempts FROM portals_analytics_delivery WHERE source_id='b'")).rows[0]!.attempts).toBe(0)
      expect((await connector.drainOnce()).delivered).toBe(1)
      expect(calls).toBe(2)
    } finally { await db.close() }
  }, 30_000)
})

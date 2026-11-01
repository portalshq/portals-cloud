import { PGlite } from '@electric-sql/pglite'
import { expect, it, vi } from 'vitest'
import { readBilling, readInteractions } from '../src/sources.js'
import { mapBillingEvent } from '../src/adapters/monetization.js'
import { mapInteractionEvent } from '../src/adapters/interaction-orchestrator.js'
import { replay } from '../src/server.js'

it('reads committed source records without changing delivery state and replays after an outage', async () => {
  const db = new PGlite()
  try {
    await db.exec(`CREATE TABLE monetization_outbox(id text, type text, payload jsonb, created_at timestamptz, delivered_at timestamptz);
      CREATE TABLE interaction_outbox(id text, world_id text, event_type text, payload jsonb, created_at timestamptz, occurred_at timestamptz, published_at timestamptz);
      INSERT INTO monetization_outbox VALUES ('bill-1','billing.purchase_settled','{"amount":100,"refundedAmount":0,"currency":"usd","buyerId":"private"}','2026-01-01T00:00:00Z',NULL);
      INSERT INTO interaction_outbox VALUES ('interaction-1','world-1','resolution_committed','{"private":"data"}','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',NULL);`)
    const queryable = {query: async (sql: string, params: unknown[]) => ({rows: (await db.query<Record<string, unknown>>(sql, params)).rows})}
    const billing = await readBilling(queryable, '2026-01-01', '2026-01-02')
    const interactions = await readInteractions(queryable, '2026-01-01', '2026-01-02')
    expect(interactions[0]).toMatchObject({ worldId: 'world-1', occurredAt: '2026-01-01T00:00:00.000Z' })
    const send = vi.fn().mockRejectedValueOnce(new Error('vendor down')).mockResolvedValue(undefined)
    await expect(replay(billing, mapBillingEvent, {send})).rejects.toThrow('vendor down')
    await replay(billing, mapBillingEvent, {send}); await replay(interactions, mapInteractionEvent, {send})
    expect(send.mock.calls[0][0][0].id).toBe(send.mock.calls[1][0][0].id)
    expect(send.mock.calls[1][0][0].properties).not.toHaveProperty('buyerId')
    expect(send.mock.calls[2][0][0].properties).toEqual({})
    expect((await db.query('SELECT delivered_at FROM monetization_outbox')).rows[0]).toEqual({delivered_at: null})
    expect((await db.query('SELECT published_at FROM interaction_outbox')).rows[0]).toEqual({published_at: null})
  } finally { await db.close() }
}, 15_000)

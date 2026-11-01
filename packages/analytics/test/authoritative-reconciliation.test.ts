import { expect, it } from 'vitest'
import type Stripe from 'stripe'
import { database, windowInput } from '../../capability-interaction-orchestrator/test/database.js'
import { PostgresBillingStore } from '../../monetization/src/postgres-store.js'
import { readBilling, readInteractions } from '../src/sources.js'
import { mapBillingEvent } from '../src/adapters/monetization.js'
import { mapInteractionEvent } from '../src/adapters/interaction-orchestrator.js'
import { createSegmentSink } from '../src/adapters/segment.js'
import { replay } from '../src/server.js'

it('reconciles committed package outboxes with Segment delivery, exposing a dropped event and a duplicate', async () => {
  const db = await database()
  try {
    const now = new Date().toISOString()
    const billing = new PostgresBillingStore(db.pool)
    const stripeEvent = {id: 'evt_fixture', type: 'checkout.session.completed', created: Math.floor(Date.now()/1000)} as Stripe.Event
    await billing.processStripeEvent(stripeEvent, async transaction => {
      await transaction.appendOutbox({id:'bill-fixture', type:'billing.purchase_settled', aggregateId:'purchase-fixture', payload:{amount:1000, refundedAmount:0, currency:'usd', buyerId:'user-1'}, createdAt:now, attempts:0})
    })
    await db.app.windows.createWindow(windowInput())
    const sourceDb = {query: async (sql: string, values: unknown[]) => ({rows: (await db.pool.query(sql, values)).rows})}
    const from = new Date(Date.now()-60_000).toISOString(), to = new Date(Date.now()+60_000).toISOString()
    const bills = await readBilling(sourceDb, from, to), interactions = await readInteractions(sourceDb, from, to)
    expect(bills).toHaveLength(1); expect(interactions.length).toBeGreaterThan(0)
    const delivered: {messageId:string; properties:Record<string,unknown>}[] = []
    const sink = createSegmentSink({track: async msg => {delivered.push(msg)}, identify: async () => {}}, {anonymousId:'fixture-source'})
    await replay(bills, mapBillingEvent, sink); await replay(interactions, mapInteractionEvent, sink)
    expect(delivered.find(event => event.messageId === 'billing:bill-fixture')?.properties).toMatchObject({amount:1000,currency:'usd'})
    const expected = [...bills.map(mapBillingEvent), ...interactions.map(mapInteractionEvent)].filter(event => event !== undefined)
    expect(new Set(delivered.map(event => event.messageId))).toEqual(new Set(expected.map(event => event.id)))
    const dropped = delivered[0]!.messageId
    const remaining = delivered.slice(1); remaining.push(remaining[0]!)
    const counts = new Map<string,number>()
    for (const event of remaining) counts.set(event.messageId, (counts.get(event.messageId) ?? 0) + 1)
    expect(expected.filter(event => !counts.has(event.id)).map(event => event.id)).toContain(dropped)
    expect([...counts.values()].some(count => count > 1)).toBe(true)
    expect((await db.pool.query('SELECT delivered_at FROM monetization_outbox WHERE id = $1',['bill-fixture'])).rows[0].delivered_at).toBeNull()
  } finally { await db.close() }
}, 30_000)

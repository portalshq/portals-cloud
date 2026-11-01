#!/usr/bin/env node
/** Backfills a bounded interval of retained committed records, filtered by
 *  source insertion time (created_at). This is the explicit operator path for
 *  records before the connector launch cutoff; it never acknowledges or
 *  changes business source rows and never fabricates person identity.
 *
 *  Interaction replays require ANALYTICS_CONTEXT_MODULE exporting
 *  resolveWorld(worldId) and resolveInteractionIdentity(record); records
 *  without a verified identity are reported blocked, not sent. */
import pg from 'pg'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { readBilling, readInteractions } from '../packages/analytics/dist/sources.js'
import { mapBillingEvent } from '../packages/analytics/dist/adapters/monetization.js'
import { mapInteractionEvent } from '../packages/analytics/dist/adapters/interaction-orchestrator.js'
import { createSegmentHttpTransport, createSegmentSink } from '../packages/analytics/dist/adapters/segment.js'

const [source, from, to, tenantArg] = process.argv.slice(2)
const start = Date.parse(from), end = Date.parse(to)
const usage = 'Usage: node scripts/analytics-backfill.mjs <billing|interaction> <from-ISO> <to-ISO> <tenantId>. Set ANALYTICS_SOURCE_DATABASE_URL, SEGMENT_SERVER_WRITE_KEY, ANALYTICS_APP_ID and (for interaction) ANALYTICS_CONTEXT_MODULE. The interval must be at most 24 hours.'
if (!['billing', 'interaction'].includes(source) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 86_400_000 || !tenantArg || !process.env.ANALYTICS_SOURCE_DATABASE_URL || !process.env.SEGMENT_SERVER_WRITE_KEY || !process.env.ANALYTICS_APP_ID) {
  console.error(usage)
  process.exitCode = 2
} else {
  const context = process.env.ANALYTICS_CONTEXT_MODULE
    ? await import(pathToFileURL(resolve(process.env.ANALYTICS_CONTEXT_MODULE)).href)
    : undefined
  if (source === 'interaction' && (typeof context?.resolveWorld !== 'function' || typeof context?.resolveInteractionIdentity !== 'function')) {
    console.error('Interaction backfill requires ANALYTICS_CONTEXT_MODULE exporting resolveWorld and resolveInteractionIdentity.')
    process.exitCode = 2
  } else {
    const appId = process.env.ANALYTICS_APP_ID
    const pool = new pg.Pool({connectionString: process.env.ANALYTICS_SOURCE_DATABASE_URL, max: 1})
    const transport = createSegmentHttpTransport({writeKey: process.env.SEGMENT_SERVER_WRITE_KEY})
    const segment = createSegmentSink(transport)
    let sent = 0, blocked = 0, excluded = 0
    try {
      const records = source === 'billing'
        ? await readBilling(pool, new Date(start).toISOString(), new Date(end).toISOString())
        : await readInteractions(pool, new Date(start).toISOString(), new Date(end).toISOString())
      for (const record of records) {
        let event = source === 'billing' ? mapBillingEvent(record) : mapInteractionEvent(record)
        if (!event) { excluded++; continue }
        let tenantId
        if (source === 'billing') {
          tenantId = typeof record.payload?.tenantId === 'string' ? record.payload.tenantId : undefined
        } else {
          tenantId = await context.resolveWorld(record.worldId)
          const identity = await context.resolveInteractionIdentity(record)
          if (identity?.userId) event = {...event, identity}
        }
        if (!event.identity?.userId && !event.identity?.anonymousId) { blocked++; continue }
        if (!tenantId) { blocked++; continue }
        const messageId = `portals-analytics:${appId}:${tenantId}:${source}:${event.id.replace(/^(billing|interaction):/, '')}`
        await segment.send([{...event, id: messageId, properties: {...event.properties, portals_source_id: record.id, portals_source_kind: source}, attribution: {tenantId, appId}}])
        sent++
      }
      console.log(JSON.stringify({source, from: new Date(start).toISOString(), to: new Date(end).toISOString(), sent, blocked, excluded}))
    } catch (error) {
      console.error('Replay failed; no source acknowledgments were changed. Review source access, event validity, identity resolution, and Segment availability.')
      process.exitCode = 1
    } finally { await pool.end() }
  }
}

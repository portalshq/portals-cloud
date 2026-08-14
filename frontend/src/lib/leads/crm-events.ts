import {advanceApolloPilotDeal} from './crm'
import {leadPool, leadsDryRun} from './store'

type CrmEventRow = {
  id: string
  source_type: 'lead_profile' | 'customer_account' | 'pilot'
  source_id: string
  event_type: string
  attempts: number
}

export async function enqueueCrmEvent(input: {
  sourceType: CrmEventRow['source_type']
  sourceId: string
  eventType: string
  eventKey: string
  payload?: Record<string, unknown>
}): Promise<void> {
  if (leadsDryRun()) return
  await leadPool().query(
    `INSERT INTO crm_outbox(source_type, source_id, event_type, event_key, payload)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT(event_key) DO NOTHING`,
    [input.sourceType, input.sourceId, input.eventType, input.eventKey, JSON.stringify(input.payload || {})],
  )
}

async function takeDueCrmEvents(limit: number): Promise<CrmEventRow[]> {
  if (leadsDryRun()) return []
  const result = await leadPool().query<CrmEventRow>(
    `UPDATE crm_outbox SET status = 'processing', updated_at = now()
      WHERE id IN (
        SELECT id FROM crm_outbox
         WHERE (status IN ('pending','retry') AND next_attempt_at <= now())
            OR (status = 'processing' AND updated_at <= now() - interval '10 minutes')
         ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT $1
      )
      RETURNING id::text, source_type, source_id, event_type, attempts`,
    [limit],
  )
  return result.rows
}

async function retryCrmEvent(row: CrmEventRow, error: unknown): Promise<void> {
  const attempts = row.attempts + 1
  const delayMinutes = Math.min(24 * 60, 5 * 6 ** Math.max(0, row.attempts))
  await leadPool().query(
    `UPDATE crm_outbox
        SET status = $2, attempts = $3, last_error = $4,
            next_attempt_at = now() + ($5 || ' minutes')::interval, updated_at = now()
      WHERE id = $1`,
    [row.id, attempts >= 6 ? 'dead' : 'retry', attempts, String(error).slice(0, 2000), String(delayMinutes)],
  )
}

export async function processCrmOutbox(limit = 20): Promise<void> {
  for (const row of await takeDueCrmEvents(limit)) {
    try {
      if (row.source_type !== 'pilot') throw new Error(`Unsupported CRM source: ${row.source_type}`)
      if (row.event_type === 'pilot_paid') await advanceApolloPilotDeal(row.source_id, 'Paid Pilot')
      else if (row.event_type === 'customer_active') await advanceApolloPilotDeal(row.source_id, 'Customer')
      else throw new Error(`Unsupported CRM event: ${row.event_type}`)
      await leadPool().query(
        `UPDATE crm_outbox SET status = 'complete', completed_at = now(), updated_at = now() WHERE id = $1`,
        [row.id],
      )
    } catch (error) {
      console.error('CRM outbox event failed:', error)
      await retryCrmEvent(row, error)
    }
  }
}

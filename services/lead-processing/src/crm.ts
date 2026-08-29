import {config} from './config.js'
import {decryptJson} from './crypto.js'
import {pool} from './db.js'

type SubmissionRow = {id: string; payload_ciphertext: string}
type OutboxRow = {id: number; submission_id: string; attempts: number}
type ApolloContact = {id?: string; email?: string}

function splitName(name: string | undefined): {first_name?: string; last_name?: string} {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  return {first_name: parts[0], last_name: parts.slice(1).join(' ') || undefined}
}

async function apollo(path: string, method: 'POST' | 'PATCH', body: unknown): Promise<Record<string, unknown>> {
  const endpoint = new URL(path, `${config.crmApiUrl.replace(/\/$/, '')}/`)
  if (endpoint.protocol !== 'https:') throw new Error('CRM_API_URL must use HTTPS.')
  const response = await fetch(endpoint, {
    method,
    headers: {'Content-Type': 'application/json', 'x-api-key': config.crmApiKey},
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`CRM synchronization failed (${response.status}).`)
  return await response.json() as Record<string, unknown>
}

/** Upsert one lead into the existing Apollo CRM without creating duplicates. */
export async function syncContact(submission: SubmissionRow): Promise<void> {
  const lead = decryptJson<{email: string; name?: string; company?: string; role?: string; payload: Record<string, unknown>}>(submission.payload_ciphertext)
  const normalizedEmail = lead.email.trim().toLowerCase()
  const search = await apollo('/api/v1/contacts/search', 'POST', {q_keywords: normalizedEmail, per_page: 10})
  const candidates = (Array.isArray(search.contacts) ? search.contacts : []) as ApolloContact[]
  const matches = candidates.filter(candidate => candidate.id && candidate.email?.trim().toLowerCase() === normalizedEmail)
  if (matches.length > 1) throw new Error(`Multiple Apollo contacts already use ${normalizedEmail}.`)
  const body = {
    ...splitName(lead.name),
    email: normalizedEmail,
    organization_name: lead.company,
    title: lead.role,
  }
  if (matches[0]?.id) await apollo(`/api/v1/contacts/${encodeURIComponent(matches[0].id)}`, 'PATCH', body)
  else await apollo('/api/v1/contacts', 'POST', body)
}

export async function processCrmOutbox(limit = 10): Promise<{processed: number}> {
  const client = await pool.connect()
  let rows: OutboxRow[] = []
  try {
    await client.query('BEGIN')
    const selected = await client.query<OutboxRow>(
      `SELECT id, submission_id, attempts FROM backend_lead_outbox
       WHERE status IN ('pending', 'retry') AND next_attempt_at <= now()
       ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`, [limit],
    )
    rows = selected.rows
    for (const row of rows) await client.query(`UPDATE backend_lead_outbox SET status = 'processing', attempts = attempts + 1, updated_at = now() WHERE id = $1`, [row.id])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  for (const row of rows) {
    try {
      const result = await pool.query<SubmissionRow>('SELECT id, payload_ciphertext FROM backend_lead_submissions WHERE id = $1', [row.submission_id])
      if (!result.rows[0]) throw new Error('Lead submission was not found.')
      await syncContact(result.rows[0])
      await pool.query(`UPDATE backend_lead_outbox SET status = 'complete', completed_at = now(), updated_at = now() WHERE id = $1`, [row.id])
      await pool.query(`UPDATE backend_lead_submissions SET status = 'complete', synced_at = now(), updated_at = now() WHERE id = $1`, [row.submission_id])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown CRM synchronization error.'
      const terminal = row.attempts + 1 >= 6
      await pool.query(
        `UPDATE backend_lead_outbox
            SET status = $2, last_error = $3, next_attempt_at = now() + (($4::text || ' minutes')::interval), updated_at = now()
          WHERE id = $1`,
        [row.id, terminal ? 'dead' : 'retry', message.slice(0, 1_000), Math.min(60, 2 ** (row.attempts + 1))],
      )
    }
  }
  return {processed: rows.length}
}

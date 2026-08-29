import {randomUUID} from 'node:crypto'
import {encryptJson, hashValue} from './crypto.js'
import {pool} from './db.js'

export type LeadInput = {
  idempotencyKey: string
  email: string
  name?: string
  company?: string
  role?: string
  payload: Record<string, unknown>
}

function normalized(input: LeadInput): LeadInput {
  const email = input.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('A valid email is required.')
  if (!/^[A-Za-z0-9_.:-]{8,180}$/.test(input.idempotencyKey)) throw new Error('A valid idempotency key is required.')
  if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) throw new Error('Lead payload must be an object.')
  if (Buffer.byteLength(JSON.stringify(input.payload)) > 32_768) throw new Error('Lead payload is too large.')
  return {...input, email}
}

export async function submitLead(input: LeadInput): Promise<{id: string; accepted: true}> {
  const lead = normalized(input)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existing = await client.query<{id: string}>(`SELECT id FROM backend_lead_submissions WHERE idempotency_key = $1 FOR UPDATE`, [lead.idempotencyKey])
    if (existing.rows[0]) {
      await client.query('COMMIT')
      return {id: existing.rows[0].id, accepted: true}
    }
    const id = randomUUID()
    await client.query(
      `INSERT INTO backend_lead_submissions(id, idempotency_key, email_hash, payload_ciphertext)
       VALUES ($1,$2,$3,$4)`,
      [id, lead.idempotencyKey, hashValue(lead.email), encryptJson(lead)],
    )
    await client.query(
      `INSERT INTO backend_lead_outbox(submission_id, action_key) VALUES ($1,$2)`,
      [id, `apollo-contact:${id}`],
    )
    await client.query('COMMIT')
    return {id, accepted: true}
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export function validateLead(input: unknown): {valid: true} {
  normalized(input as LeadInput)
  return {valid: true}
}

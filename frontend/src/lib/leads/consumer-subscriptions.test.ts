import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { POST } from '../../../app/api/consumer-subscriptions/route'
import { getProfileByEmail, outboxActions, persistSubmission } from './store'
import { leadRequestSchema } from './contracts'

process.env.LEADS_DRY_RUN = 'true'
process.env.CONSUMER_CRM_INGEST_SECRET = '0123456789abcdef0123456789abcdef'

test('consumer intake authenticates and accepts a verified personal mailbox without marketing consent', async () => {
  const email = `viewer-${randomUUID()}@gmail.com`
  const body = { id: randomUUID(), email, payload: { programId: 'bears', episode: true, weekly: true } }
  const request = (credential: string) => new Request('https://example.test/api/consumer-subscriptions', {
    method: 'POST', headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  assert.equal((await POST(request('wrong'))).status, 401)
  assert.equal((await POST(request(process.env.CONSUMER_CRM_INGEST_SECRET!))).status, 200)
  assert.equal((await POST(request(process.env.CONSUMER_CRM_INGEST_SECRET!))).status, 200)
  const profile = await getProfileByEmail(email)
  assert.equal(profile?.identityVerified, true)
  assert.equal(profile?.marketingConsent, false)
})

test('show subscriptions only enqueue the CRM projection', () => {
  const request = leadRequestSchema.parse({ submissionType: 'show_subscription', idempotencyKey: randomUUID(),
    formVersion: 'v1', identity: { email: 'viewer@gmail.com' }, attribution: { sourcePage: '/bears' },
    consent: { disclosureVersion: '2026-08-01', marketing: false, analytics: false },
    answers: { programId: 'bears', episode: true, weekly: true } })
  assert.deepEqual(outboxActions(request), ['apollo_sync'])
})

test('show subscription does not overwrite existing marketing or analytics consent', async () => {
  const email = `viewer-${randomUUID()}@example.com`
  const original = leadRequestSchema.parse({ submissionType: 'contact', idempotencyKey: randomUUID(), formVersion: 'v1',
    identity: { email }, attribution: { sourcePage: '/contact' },
    consent: { disclosureVersion: '2026-08-01', marketing: true, analytics: true }, answers: { question: 'Hello' } })
  await persistSubmission({ request: original, identity: { email }, verified: true, response: { ok: true, nextAction: 'follow_up' } })
  const body = { id: randomUUID(), email, payload: { programId: 'bears', episode: true, weekly: true } }
  const response = await POST(new Request('https://example.test/api/consumer-subscriptions', { method: 'POST',
    headers: { authorization: `Bearer ${process.env.CONSUMER_CRM_INGEST_SECRET}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }))
  assert.equal(response.status, 200)
  const profile = await getProfileByEmail(email)
  assert.equal(profile?.marketingConsent, true)
  assert.equal(profile?.analyticsConsent, true)
})

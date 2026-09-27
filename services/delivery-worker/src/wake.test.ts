import assert from 'node:assert/strict'
import test from 'node:test'
import {signatureFor, verifySignature} from './wake.js'

test('wake signatures reject tampering and stale requests', () => {
  const input = {
    secret: 'test-secret',
    method: 'POST',
    path: '/internal/wake',
    timestamp: '1700000000',
    wakeId: 'wake-1',
    body: '{"job_id":"job-1"}',
  }
  const signature = signatureFor(input)
  assert.equal(verifySignature({...input, signature, now: 1700000000}), true)
  assert.equal(verifySignature({...input, signature, body: '{}', now: 1700000000}), false)
  assert.equal(verifySignature({...input, signature, now: 1700000401}), false)
})

import {createHash, createHmac, timingSafeEqual} from 'node:crypto'

export const MAX_CLOCK_SKEW_SECONDS = 300

export function signatureFor(input: {
  secret: string
  method: string
  path: string
  timestamp: string
  wakeId: string
  body: string
}): string {
  const bodyHash = createHash('sha256').update(input.body).digest('hex')
  const canonical = [input.method.toUpperCase(), input.path, input.timestamp, input.wakeId, bodyHash].join('\n')
  return createHmac('sha256', input.secret).update(canonical).digest('base64url')
}

export function verifySignature(input: {
  secret: string
  method: string
  path: string
  timestamp: string
  wakeId: string
  body: string
  signature: string
  now?: number
}): boolean {
  const timestamp = Number(input.timestamp)
  const now = input.now ?? Math.floor(Date.now() / 1000)
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > MAX_CLOCK_SKEW_SECONDS) return false
  const expected = Buffer.from(signatureFor(input), 'base64url')
  const received = Buffer.from(input.signature, 'base64url')
  return expected.length === received.length && timingSafeEqual(expected, received)
}

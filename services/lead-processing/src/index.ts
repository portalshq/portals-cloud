import {createHmac, timingSafeEqual} from 'node:crypto'
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http'
import {config} from './config.js'
import {secureEqual, encryptJson} from './crypto.js'
import {pool} from './db.js'
import {processCrmOutbox} from './crm.js'
import {submitLead, validateLead} from './leads.js'

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'})
  response.end(JSON.stringify(body))
}

function cors(request: IncomingMessage, response: ServerResponse): boolean {
  const origin = request.headers.origin
  if (!origin) return true
  if (!config.allowedOrigins.includes(origin)) return false
  response.setHeader('Access-Control-Allow-Origin', origin)
  response.setHeader('Vary', 'Origin')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Portals-Backend-Token, X-Portals-Signature, Idempotency-Key')
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  return true
}

function requireBackendToken(request: IncomingMessage): void {
  const token = request.headers['x-portals-backend-token']
  if (typeof token !== 'string' || !secureEqual(token, config.backendToken)) throw new Error('Backend authentication is required.')
}

async function rawBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += value.length
    if (size > 32_768) throw new Error('Request body is too large.')
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

const server = createServer(async (request, response) => {
  try {
    if (!cors(request, response)) return json(response, 403, {error: 'Origin is not allowed.'})
    if (request.method === 'OPTIONS') return response.writeHead(204).end()
    const pathname = new URL(request.url || '/', 'http://localhost').pathname
    if (request.method === 'GET' && pathname === '/health') return json(response, 200, {ok: true})
    if (request.method !== 'POST') return json(response, 405, {error: 'Method not allowed.'})
    const raw = await rawBody(request)
    if (pathname === '/api/webhooks/crm') {
      const received = request.headers['x-portals-signature']
      const expected = createHmac('sha256', config.crmWebhookSecret).update(raw).digest('base64url')
      if (typeof received !== 'string' || received.length !== expected.length || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) throw new Error('CRM webhook signature is invalid.')
      const event = JSON.parse(raw.toString('utf8')) as {id?: unknown}
      const eventId = typeof event.id === 'string' && event.id.length <= 160 ? event.id : null
      await pool.query(`INSERT INTO backend_crm_webhooks(event_id, payload_ciphertext) VALUES ($1,$2) ON CONFLICT(event_id) WHERE event_id IS NOT NULL DO NOTHING`, [eventId, encryptJson(event)])
      return json(response, 202, {accepted: true})
    }
    requireBackendToken(request)
    const input = JSON.parse(raw.toString('utf8') || '{}') as Record<string, unknown>
    if (pathname === '/api/leads/submit') return json(response, 202, await submitLead(input as never))
    if (pathname === '/api/leads/validate') return json(response, 200, validateLead(input))
    if (pathname === '/api/leads/sync-crm') return json(response, 200, await processCrmOutbox(10))
    return json(response, 404, {error: 'Not found.'})
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected lead processing error.'
    const status = /authentication|signature/i.test(message) ? 401 : 400
    console.error('Lead processing request failed', {message})
    return json(response, status, {error: message})
  }
})

server.listen(config.port, () => console.log(`LeadProcessingService listening on ${config.port}`))

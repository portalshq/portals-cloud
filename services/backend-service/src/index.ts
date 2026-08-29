import {createHmac, timingSafeEqual} from 'node:crypto'
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http'
import {authenticatedApplicationUserId} from '../../invitation-service/src/auth.js'
import {config as invitationConfig} from '../../invitation-service/src/config.js'
import {
  acceptInvitation,
  createInvitation,
  listInvitations,
  rejectInvitation,
  validateInvitation,
} from '../../invitation-service/src/invitations.js'
import {secureEqual, encryptJson} from '../../lead-processing/src/crypto.js'
import {pool} from '../../lead-processing/src/db.js'
import {processCrmOutbox} from '../../lead-processing/src/crm.js'
import {submitLead, validateLead} from '../../lead-processing/src/leads.js'
import {config as leadConfig} from '../../lead-processing/src/config.js'

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'})
  response.end(JSON.stringify(body))
}

function cors(request: IncomingMessage, response: ServerResponse): boolean {
  const origin = request.headers.origin
  if (!origin) return true
  if (!invitationConfig.allowedOrigins.includes(origin)) return false
  response.setHeader('Access-Control-Allow-Origin', origin)
  response.setHeader('Vary', 'Origin')
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Portals-Backend-Token, X-Portals-Actor-Id, X-Portals-Signature, Idempotency-Key')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  return true
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

function jsonObject(raw: Buffer): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw.toString('utf8') || '{}')
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Request body must be an object.')
  return parsed as Record<string, unknown>
}

function value(input: Record<string, unknown>, key: string): string {
  return typeof input[key] === 'string' ? input[key].trim() : ''
}

function requireBackendToken(request: IncomingMessage): void {
  const token = request.headers['x-portals-backend-token']
  if (typeof token !== 'string' || !secureEqual(token, leadConfig.backendToken)) {
    throw new Error('Backend authentication is required.')
  }
}

async function invitationRoute(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean> {
  if (request.method === 'POST' && (pathname === '/api/invitations/team' || pathname === '/api/invitations/pilot')) {
    const actorId = await authenticatedApplicationUserId(request)
    const input = jsonObject(await rawBody(request))
    const type = pathname.endsWith('/team') ? 'team_member' : 'pilot_room'
    return json(response, 201, await createInvitation({
      actorId,
      type,
      email: value(input, 'email'),
      role: value(input, 'role'),
      customerAccountId: type === 'team_member' ? value(input, 'customerAccountId') : undefined,
      pilotId: type === 'pilot_room' ? value(input, 'pilotId') : undefined,
    })), true
  }
  if (request.method === 'GET' && pathname === '/api/invitations') {
    return json(response, 200, await listInvitations(await authenticatedApplicationUserId(request))), true
  }
  const match = pathname.match(/^\/api\/invitations\/([^/]+)(?:\/(accept|reject))?$/)
  if (!match) return false
  const token = decodeURIComponent(match[1])
  if (request.method === 'GET' && !match[2]) {
    const invitation = await validateInvitation(token)
    return json(response, invitation ? 200 : 404, invitation || {error: 'Invitation is invalid or expired.'}), true
  }
  if (request.method === 'POST' && match[2] === 'accept') return json(response, 200, await acceptInvitation(token)), true
  if (request.method === 'POST' && match[2] === 'reject') {
    await rejectInvitation(token)
    return json(response, 200, {ok: true}), true
  }
  return false
}

async function leadRoute(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean> {
  if (request.method !== 'POST') return false
  const raw = await rawBody(request)
  if (pathname === '/api/webhooks/crm') {
    const received = request.headers['x-portals-signature']
    const expected = createHmac('sha256', leadConfig.crmWebhookSecret).update(raw).digest('base64url')
    if (typeof received !== 'string' || received.length !== expected.length || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
      throw new Error('CRM webhook signature is invalid.')
    }
    const event = jsonObject(raw)
    const eventId = typeof event.id === 'string' && event.id.length <= 160 ? event.id : null
    await pool.query(
      `INSERT INTO backend_crm_webhooks(event_id, payload_ciphertext)
       VALUES ($1,$2) ON CONFLICT(event_id) WHERE event_id IS NOT NULL DO NOTHING`,
      [eventId, encryptJson(event)],
    )
    return json(response, 202, {accepted: true}), true
  }

  requireBackendToken(request)
  const input = jsonObject(raw)
  if (pathname === '/api/leads/submit') return json(response, 202, await submitLead(input as Parameters<typeof submitLead>[0])), true
  if (pathname === '/api/leads/validate') return json(response, 200, validateLead(input)), true
  if (pathname === '/api/leads/sync-crm') return json(response, 200, await processCrmOutbox(10)), true
  return false
}

const server = createServer(async (request, response) => {
  try {
    if (!cors(request, response)) return json(response, 403, {error: 'Origin is not allowed.'})
    if (request.method === 'OPTIONS') return response.writeHead(204).end()
    const pathname = new URL(request.url || '/', 'http://localhost').pathname
    if (request.method === 'GET' && pathname === '/health') return json(response, 200, {ok: true})
    if (await invitationRoute(request, response, pathname)) return
    if (await leadRoute(request, response, pathname)) return
    return json(response, 404, {error: 'Not found.'})
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected backend service error.'
    const status = /authentication|access token|not allowed|not linked|signature/i.test(message) ? 401 : 400
    console.error('Backend request failed', {message})
    return json(response, status, {error: message})
  }
})

server.listen(invitationConfig.port, () => console.log(`BackendService listening on ${invitationConfig.port}`))
const outboxTimer = setInterval(() => {
  void processCrmOutbox(10).catch((error: unknown) => console.error('CRM outbox processing failed', {error}))
}, 60_000)
outboxTimer.unref()

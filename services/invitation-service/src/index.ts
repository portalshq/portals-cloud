import {createServer, type IncomingMessage, type ServerResponse} from 'node:http'
import {authenticatedApplicationUserId} from './auth.js'
import {config} from './config.js'
import {acceptInvitation, createInvitation, listInvitations, rejectInvitation, validateInvitation} from './invitations.js'

function cors(request: IncomingMessage, response: ServerResponse): boolean {
  const origin = request.headers.origin
  if (!origin) return true
  if (!config.allowedOrigins.includes(origin)) return false
  response.setHeader('Access-Control-Allow-Origin', origin)
  response.setHeader('Vary', 'Origin')
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  return true
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'})
  response.end(JSON.stringify(body))
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += value.length
    if (size > 32_768) throw new Error('Request body is too large.')
    chunks.push(value)
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Request body must be an object.')
  return parsed as Record<string, unknown>
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

const server = createServer(async (request, response) => {
  try {
    if (!cors(request, response)) return json(response, 403, {error: 'Origin is not allowed.'})
    if (request.method === 'OPTIONS') return response.writeHead(204).end()
    const pathname = new URL(request.url || '/', 'http://localhost').pathname
    if (request.method === 'GET' && pathname === '/health') return json(response, 200, {ok: true})
    if (request.method === 'POST' && (pathname === '/api/invitations/team' || pathname === '/api/invitations/pilot')) {
      const actorId = await authenticatedApplicationUserId(request)
      const input = await body(request)
      const type = pathname.endsWith('/team') ? 'team_member' : 'pilot_room'
      const invitation = await createInvitation({
        actorId, type, email: string(input.email), role: string(input.role),
        customerAccountId: type === 'team_member' ? string(input.customerAccountId) : undefined,
        pilotId: type === 'pilot_room' ? string(input.pilotId) : undefined,
      })
      return json(response, 201, invitation)
    }
    if (request.method === 'GET' && pathname === '/api/invitations') return json(response, 200, await listInvitations(await authenticatedApplicationUserId(request)))
    const match = pathname.match(/^\/api\/invitations\/([^/]+)(?:\/(accept|reject))?$/)
    if (match) {
      const token = decodeURIComponent(match[1])
      if (request.method === 'GET' && !match[2]) {
        const invitation = await validateInvitation(token)
        return invitation ? json(response, 200, invitation) : json(response, 404, {error: 'Invitation is invalid or expired.'})
      }
      if (request.method === 'POST' && match[2] === 'accept') return json(response, 200, await acceptInvitation(token))
      if (request.method === 'POST' && match[2] === 'reject') {
        await rejectInvitation(token)
        return json(response, 200, {ok: true})
      }
    }
    return json(response, 404, {error: 'Not found.'})
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected invitation service error.'
    const status = /Authentication|access token|not allowed|not linked/.test(message) ? 401 : 400
    console.error('Invitation request failed', {message})
    return json(response, status, {error: message})
  }
})

server.listen(config.port, () => console.log(`InvitationService listening on ${config.port}`))

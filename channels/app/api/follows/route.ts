import { CentralIdentityStore, ProgramFollowsStore, createAuthGatewayClient } from '@portalshq/capability-identity'
import { centralDb } from '../../../lib/admin/db'

let gateway: ReturnType<typeof createAuthGatewayClient> | undefined

async function viewer(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1]
  if (!token) return null
  const address = process.env.AUTH_GATEWAY_TCP_ADDRESS?.trim()
  if (!address) throw new Error('Authentication unavailable')
  gateway ??= createAuthGatewayClient({ address, useTls: process.env.AUTH_GATEWAY_TLS?.trim().toLowerCase() === 'true' })
  return gateway.verifyUser(token)
}

function result(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

async function handle(request: Request) {
  if (request.method !== 'GET' && request.headers.get('sec-fetch-site') === 'cross-site') return result({ error: 'Forbidden' }, 403)
  try {
    const identity = await viewer(request)
    if (!identity) return result({ error: 'Sign in required' }, 401)
    const db = centralDb()
    // Gateway identity, never a browser-supplied user ID, owns this operation.
    await new CentralIdentityStore(db).syncFromAuthGateway(identity.userId, identity.displayName)
    const active = await db.query("SELECT 1 FROM users WHERE id = $1 AND status = 'active'", [identity.userId])
    if (!active.rowCount) return result({ error: 'Account unavailable' }, 403)
    const follows = new ProgramFollowsStore(db)
    if (request.method === 'GET') return result({ programs: await follows.list(identity.userId) })
    const body = await request.json().catch(() => null)
    if (!body || typeof body.programId !== 'string' || !body.programId.trim() || body.programId.length > 256 || typeof body.follow !== 'boolean') {
      return result({ error: 'Invalid request' }, 400)
    }
    if (body.follow) {
      const exists = await db.query('SELECT id FROM programs WHERE id = $1', [body.programId])
      if (!exists.rowCount) return result({ error: 'Program not found' }, 404)
      await follows.follow(identity.userId, body.programId)
    } else {
      await follows.unfollow(identity.userId, body.programId)
    }
    return result({ ok: true })
  } catch (error) {
    const code = (error as { code?: number }).code
    if (code === 7 || code === 16) return result({ error: 'Session expired' }, 401)
    console.error('[follows] unavailable', error)
    return result({ error: 'Follows unavailable' }, 503)
  }
}

export const GET = handle
export const POST = handle

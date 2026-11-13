import { randomUUID } from 'node:crypto'
import { createAuthGatewayClient, type AuthSessionTokens } from '@portalshq/capability-identity'

let gateway: ReturnType<typeof createAuthGatewayClient> | undefined
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function session(tokens: AuthSessionTokens) {
  return json({
    userId: tokens.userId,
    token: tokens.userToken,
    refreshToken: tokens.refreshToken ?? null,
    expiresAt: tokens.expiresAt,
    displayName: tokens.userName || null,
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params
  if (!['start', 'complete', 'refresh', 'sign-out', 'display-name'].includes(action)) {
    return json({ error: 'Not found' }, 404)
  }
  if (request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Forbidden' }, 403)
  const address = process.env.AUTH_GATEWAY_TCP_ADDRESS?.trim()
  if (!address) return json({ error: 'Sign-in is unavailable right now.' }, 503)

  try {
    gateway ??= createAuthGatewayClient({
      address,
      useTls: process.env.AUTH_GATEWAY_TLS?.trim().toLowerCase() === 'true',
    })
    if (action === 'start') {
      const origin = request.headers.get('origin')
      const origins = process.env.CHANNELS_AUTH_ORIGINS?.split(',').map(value => value.trim()) ?? []
      if (!origin || !origins.includes(origin)) return json({ error: 'This Channels address is not configured for sign-in.' }, 403)
      const state = randomUUID()
      return json({ ...await gateway.startAuthSession(state, new URL('/auth/complete', origin).href), state })
    }
    const body = await request.json().catch(() => null)
    if (!body) return json({ error: 'Invalid request' }, 400)
    if (action === 'complete') {
      if (typeof body.sessionCode !== 'string' || !uuid.test(body.sessionCode)
        || typeof body.state !== 'string' || !uuid.test(body.state)) return json({ error: 'Invalid sign-in session' }, 400)
      const tokens = await gateway.getAuthSession(body.sessionCode, body.state)
      if (!tokens) return json({ error: 'Sign-in did not complete. Try again.' }, 401)
      if (!tokens.userName) {
        const profile = await gateway.verifyUser(tokens.userToken).catch(() => null)
        if (profile?.displayName) return session({ ...tokens, userName: profile.displayName })
      }
      return session(tokens)
    }
    if (action === 'display-name') {
      const bearer = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1]
      if (!bearer) return json({ error: 'Sign in to set your username.' }, 401)
      const name = typeof body.displayName === 'string' ? body.displayName.trim() : ''
      if (!name || name.length > 64) return json({ error: 'Use 1–64 characters.' }, 400)
      try {
        return json(await gateway.setUserDisplayName(bearer, name))
      } catch (error) {
        if ((error as { code?: number }).code === 9) {
          const profile = await gateway.verifyUser(bearer).catch(() => null)
          if (profile?.displayName) return json(profile)
        }
        throw error
      }
    }
    const credential = typeof body.refreshToken === 'string' ? body.refreshToken : ''
    if (!credential) return json({ error: 'Missing session credential' }, 400)
    if (action === 'sign-out') {
      await gateway.revokeAuthSession(credential)
      return json({ ok: true })
    }
    const tokens = await gateway.refreshAuthSession(credential)
    return tokens ? session(tokens) : json({ error: 'Session expired' }, 401)
  } catch (error) {
    const code = (error as { code?: number }).code
    if (action === 'start' && code === 7) {
      return json({ error: 'This Channels address is not approved by the sign-in gateway.' }, 403)
    }
    if (action === 'refresh' && (code === 7 || code === 16)) return json({ error: 'Session expired' }, 401)
    if (action === 'display-name' && (code === 3 || code === 9)) {
      return json({ error: code === 9 ? 'Your username is already set.' : 'Choose a different username.' }, code === 9 ? 409 : 400)
    }
    if (action === 'display-name' && (code === 7 || code === 16)) return json({ error: 'Session expired' }, 401)
    console.error('[channels auth]', action, code ?? 'unavailable')
    return json({ error: 'Sign-in is unavailable right now.' }, 503)
  }
}

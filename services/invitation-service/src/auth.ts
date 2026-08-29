import {createPublicKey, verify} from 'node:crypto'
import type {IncomingMessage} from 'node:http'
import {config} from './config.js'
import {secureEqual} from './crypto.js'
import {pool} from './db.js'

type JwtHeader = {alg?: string; kid?: string}
type JwtPayload = {sub?: string; token_use?: string; iss?: string; exp?: number}
type Jwk = JsonWebKey & {kid?: string}

let jwks: {expiresAt: number; keys: Map<string, Jwk>} | undefined

function readBearer(request: IncomingMessage): string {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) throw new Error('Authentication is required.')
  return header.slice('Bearer '.length)
}

async function signingKey(kid: string): Promise<Jwk> {
  if (!jwks || jwks.expiresAt < Date.now()) {
    const url = `https://cognito-idp.${config.awsRegion}.amazonaws.com/${config.cognitoUserPoolId}/.well-known/jwks.json`
    const response = await fetch(url)
    if (!response.ok) throw new Error('Cognito signing keys are unavailable.')
    const body = await response.json() as {keys?: Jwk[]}
    jwks = {expiresAt: Date.now() + 15 * 60_000, keys: new Map((body.keys || []).flatMap((key) => key.kid ? [[key.kid, key]] : []))}
  }
  const key = jwks.keys.get(kid)
  if (!key) throw new Error('The access token signing key is unknown.')
  return key
}

async function cognitoApplicationUserId(request: IncomingMessage): Promise<string> {
  const token = readBearer(request)
  const [encodedHeader, encodedPayload, encodedSignature, ...rest] = token.split('.')
  if (!encodedHeader || !encodedPayload || !encodedSignature || rest.length) throw new Error('Invalid access token.')
  const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')) as JwtHeader
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as JwtPayload
  if (header.alg !== 'RS256' || !header.kid || !payload.sub || payload.token_use !== 'access') throw new Error('Invalid access token.')
  const issuer = `https://cognito-idp.${config.awsRegion}.amazonaws.com/${config.cognitoUserPoolId}`
  if (payload.iss !== issuer || !payload.exp || payload.exp * 1000 <= Date.now()) throw new Error('Access token is expired or issued for another pool.')
  // Node's JWK input type is structurally stricter than the web-standard
  // JsonWebKey returned by Cognito, although it accepts this representation.
  const publicKey = createPublicKey({key: await signingKey(header.kid), format: 'jwk'} as Parameters<typeof createPublicKey>[0])
  const valid = verify('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), publicKey, Buffer.from(encodedSignature, 'base64url'))
  if (!valid) throw new Error('Invalid access token signature.')
  const result = await pool.query<{id: string}>('SELECT id FROM application_users WHERE cognito_subject = $1 AND status = \'active\'', [payload.sub])
  if (!result.rows[0]) throw new Error('The Cognito user is not linked to an active application account.')
  return result.rows[0].id
}

/**
 * Browser callers prove identity with a Cognito access token. Vercel's legacy
 * cookie-session routes use the second path during the incremental migration:
 * they send a server-only integration token and the already authenticated app
 * user ID. Authorization is still checked again by invitation queries in AWS.
 */
export async function authenticatedApplicationUserId(request: IncomingMessage): Promise<string> {
  const backendToken = request.headers['x-portals-backend-token']
  const actorId = request.headers['x-portals-actor-id']
  if (typeof backendToken === 'string' && typeof actorId === 'string' && secureEqual(backendToken, config.backendToken)) {
    if (!/^[0-9a-f-]{36}$/i.test(actorId)) throw new Error('Backend actor identity is invalid.')
    const result = await pool.query<{id: string}>(
      `SELECT id FROM application_users WHERE id = $1 AND status = 'active'`,
      [actorId],
    )
    if (!result.rows[0]) throw new Error('Backend actor is not linked to an active application account.')
    return result.rows[0].id
  }
  return cognitoApplicationUserId(request)
}

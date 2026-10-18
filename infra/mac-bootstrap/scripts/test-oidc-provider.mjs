#!/usr/bin/env node
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {dirname, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

function normalizedIssuer(value) {
  return String(value).replace(/\/$/, '')
}

function secureUrl(value, label) {
  let parsed
  try { parsed = new URL(value) } catch { throw new Error(`${label} is not a URL`) }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
    throw new Error(`${label} must be an HTTPS URL without credentials or fragment`)
  }
  return parsed
}

export function validateOidcDiscovery(issuer, discovery, jwks) {
  const expectedIssuer = normalizedIssuer(issuer)
  if (normalizedIssuer(discovery?.issuer) !== expectedIssuer) throw new Error('OIDC discovery issuer does not exactly match configured issuer')
  const authorization = secureUrl(discovery.authorization_endpoint, 'authorization_endpoint')
  secureUrl(discovery.token_endpoint, 'token_endpoint')
  secureUrl(discovery.jwks_uri, 'jwks_uri')
  if (authorization.origin !== new URL(expectedIssuer).origin) throw new Error('OIDC authorization endpoint is on an unexpected origin')
  if (!(discovery.response_types_supported || []).includes('code')) throw new Error('OIDC provider does not advertise authorization-code flow')
  if (!(discovery.code_challenge_methods_supported || []).includes('S256')) throw new Error('OIDC provider does not advertise PKCE S256')
  const keys = Array.isArray(jwks?.keys) ? jwks.keys : []
  if (!keys.some(key => key.kty === 'RSA' && key.alg === 'RS256' && key.use === 'sig' && key.kid && key.n && key.e)) {
    throw new Error('OIDC JWKS contains no RSA/RS256 signing key required by Auth Gateway')
  }
  const kids = keys.map(key => key.kid).filter(Boolean)
  if (new Set(kids).size !== kids.length) throw new Error('OIDC JWKS contains duplicate key IDs')
  return {
    issuer: expectedIssuer,
    authorizationOrigin: authorization.origin,
    authorizationPath: authorization.pathname,
    signingKids: kids,
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {redirect: 'error', signal: AbortSignal.timeout(10000), headers: {accept: 'application/json'}})
  if (!response.ok) throw new Error(`OIDC provider returned HTTP ${response.status}`)
  return response.json()
}

function requiredEnv(name) {
  const value = process.env[name]
  if (!value || value.includes('__REPLACE_')) throw new Error(`${name} must be configured with a real test value`)
  return value
}

async function run() {
  const issuer = requiredEnv('OIDC_ISSUER')
  secureUrl(issuer, 'OIDC_ISSUER')
  const discoveryUrl = `${normalizedIssuer(issuer)}/.well-known/openid-configuration`
  const discovery = await fetchJson(discoveryUrl)
  const jwks = await fetchJson(secureUrl(discovery.jwks_uri, 'jwks_uri').href)
  const provider = validateOidcDiscovery(issuer, discovery, jwks)
  const results = [{check: 'provider_discovery_issuer_endpoints_pkce_and_rs256_jwks', status: 'passed', detail: `issuer=${provider.issuer} signing_key_count=${provider.signingKids.length}`}]

  if (process.env.OIDC_AUTH_GRPC_TARGET || process.env.OIDC_AUTH_HTTP_BASE) {
    const grpcTarget = requiredEnv('OIDC_AUTH_GRPC_TARGET')
    const httpBase = requiredEnv('OIDC_AUTH_HTTP_BASE').replace(/\/$/, '')
    const clientId = requiredEnv('OIDC_CLIENT_ID')
    const redirectUri = requiredEnv('OIDC_REDIRECT_URI')
    const grpcurl = process.env.GRPCURL_BIN || 'grpcurl'
    const proto = requiredEnv('AUTH_API_PROTO_FILE')
    const clientState = randomUUID()
    const args = []
    if (process.env.OIDC_AUTH_GRPC_TLS === 'plaintext') args.push('-plaintext')
    args.push('-import-path', dirname(resolve(proto)), '-proto', resolve(proto), '-d', JSON.stringify({client_state: clientState}), grpcTarget, 'epic_urc.UrcAuthApi/StartAuthSession')
    const started = spawnSync(grpcurl, args, {encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024})
    assert.equal(started.status, 0, 'Auth Gateway StartAuthSession failed')
    const session = JSON.parse(started.stdout)
    // grpcurl emits protobuf JSON's canonical camelCase field names unless
    // explicitly asked to preserve proto field names. Accept both spellings
    // so this probe works with either grpcurl output setting.
    const loginUrlText = session.loginUrl ?? session.login_url
    if (typeof loginUrlText !== 'string' || loginUrlText.length === 0) {
      throw new Error(`Auth Gateway StartAuthSession response omitted login_url (fields=${Object.keys(session).sort().join(',')})`)
    }
    const loginUrl = new URL(loginUrlText)
    const expectedAuthorization = new URL(discovery.authorization_endpoint)
    assert.equal(loginUrl.origin + loginUrl.pathname, expectedAuthorization.origin + expectedAuthorization.pathname)
    assert.equal(loginUrl.searchParams.get('response_type'), 'code')
    assert.equal(loginUrl.searchParams.get('client_id'), clientId)
    assert.equal(loginUrl.searchParams.get('redirect_uri'), redirectUri)
    assert.deepEqual(new Set((loginUrl.searchParams.get('scope') || '').split(/\s+/)), new Set(['openid', 'email', 'profile']))
    assert.equal(loginUrl.searchParams.get('code_challenge_method'), 'S256')
    assert.match(loginUrl.searchParams.get('state') || '', /^[0-9a-f-]{36}$/i)
    assert.match(loginUrl.searchParams.get('nonce') || '', /^[0-9a-f-]{36}$/i)
    assert.match(loginUrl.searchParams.get('code_challenge') || '', /^[A-Za-z0-9_-]{43}$/)
    results.push({check: 'auth_gateway_start_session_pkce_redirect_and_nonce', status: 'passed'})

    const wrongState = randomUUID()
    const callback = new URL(`${httpBase}/callback`)
    callback.searchParams.set('state', wrongState)
    callback.searchParams.set('code', 'portals-readiness-invalid-code')
    const rejected = await fetch(callback, {redirect: 'manual', signal: AbortSignal.timeout(10000)})
    await rejected.body?.cancel()
    assert.equal(rejected.status, 400, 'Auth Gateway accepted a callback with an unknown OIDC state')
    results.push({check: 'callback_unknown_state_rejected', status: 'passed', detail: 'HTTP 400'})
    results.push({check: 'pending_login_session_cleanup', status: 'deferred', detail: 'The isolated StartAuthSession row is intentionally left to expire within 10 minutes'})
  }

  const executedChecksPassed = results.every(x => x.status === 'passed' || x.status === 'deferred')
  process.stdout.write(JSON.stringify({
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    scope: process.env.OIDC_AUTH_GRPC_TARGET ? 'provider-discovery-and-auth-session-smoke' : 'provider-discovery-only',
    passed: executedChecksPassed,
    productionGatePassed: false,
    incomplete: [
      'interactive browser authorization and successful callback',
      'ID/access-token claims and 900-second production lifetime',
      'refresh-token rotation and replay rejection',
      'signing-key overlap and audit-event verification',
    ],
    results,
  }, null, 2) + '\n')
  if (!executedChecksPassed) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run().catch(error => {
    console.error(`OIDC_ACCEPTANCE_FAILED ${String(error.message).split('\n')[0]}`)
    process.exitCode = 1
  })
}

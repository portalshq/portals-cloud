// Live probe: creates a uniquely named test principal, then revokes all its keys
// and disables it. Audit records are deliberately retained. No token is logged.
import {readFileSync} from 'node:fs'
import {basename, dirname} from 'node:path'
import {randomUUID, createPublicKey, verify} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import assert from 'node:assert/strict'

assert.ok(process.argv.includes('--create-isolated-fixture'), 'Pass --create-isolated-fixture for this live write test')
const envFile = process.env.AUTH_TEST_ENV_FILE ?? '/Users/portals-svc/secrets/auth.env'
const env = readFileSync(envFile, 'utf8')
const admin = env.match(/^INTERNAL_ADMIN_TOKEN=(.+)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2')
assert.ok(admin && !admin.includes('__REPLACE_'), 'Configured internal admin credential is required')
const expectedAccessTokenTtl = Number(process.env.AUTH_EXPECTED_ACCESS_TOKEN_TTL_SECONDS ?? '900')
assert.ok(Number.isInteger(expectedAccessTokenTtl) && expectedAccessTokenTtl >= 60 && expectedAccessTokenTtl <= 3600,
  'AUTH_EXPECTED_ACCESS_TOKEN_TTL_SECONDS must be an integer from 60 to 3600')
const internalBaseUrl = process.env.AUTH_TEST_INTERNAL_BASE_URL ?? 'http://127.0.0.1:8086'
const grpcTarget = process.env.AUTH_TEST_GRPC_TARGET ?? '127.0.0.1:8084'
const httpBaseUrl = process.env.AUTH_TEST_HTTP_BASE_URL ?? 'http://127.0.0.1:8085'
const expectedIssuer = process.env.AUTH_TEST_EXPECTED_ISSUER ?? 'https://auth.portals.works'
const grpcurl = process.env.AUTH_TEST_GRPCURL_BIN ?? '/Users/Shared/portals-tools/bin/grpcurl'
const protoFile = process.env.AUTH_TEST_PROTO_FILE ?? '/Users/Shared/portals-auth-api-test.proto'
const importPath = process.env.AUTH_TEST_IMPORT_PATH ?? dirname(protoFile)
assert.ok(expectedIssuer.startsWith('https://'), 'AUTH_TEST_EXPECTED_ISSUER must use HTTPS')
const subject = `readiness-${randomUUID()}`
const keyIds = new Set()
async function internal(path, method, data) {
  const response = await fetch(new URL(path, internalBaseUrl), {
    method, headers: {authorization: `Bearer ${admin}`, 'content-type': 'application/json'},
    body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(10000),
  })
  assert.ok(response.ok, `Internal fixture operation failed: ${method} ${response.status}`)
  return response.status === 204 ? null : response.json()
}
function exchange(key, denied = false) {
  const p = spawnSync(grpcurl, [
    '-plaintext', '-max-time', '10', '-import-path', importPath,
    '-proto', basename(protoFile), '-d', '@', grpcTarget,
    'epic_urc.UrcAuthApi/ExchangeAPIKeyForUserToken',
  ], {input: JSON.stringify({apiKey: key}), encoding: 'utf8', timeout: 15000})
  if (denied) { assert.notEqual(p.status, 0); assert.match(p.stderr, /Code: Unauthenticated/); return }
  assert.equal(p.status, 0, 'API-key exchange failed')
  return JSON.parse(p.stdout).userToken.userToken
}
const keyId = key => {
  const id = key.split('.')[0].replace(/^lore_sk_/, '')
  assert.match(id, /^[0-9a-f-]{36}$/i, 'Unexpected API-key public-id format')
  keyIds.add(id)
  return id
}
try {
  const issued = await internal('/v1/api-keys', 'POST', {service_account_id: subject, display_name: 'Production readiness fixture', lifetime_days: 1})
  const oldId = keyId(issued.api_key)
  const jwt = exchange(issued.api_key)
  const [header, payload, signature] = jwt.split('.')
  const h = JSON.parse(Buffer.from(header, 'base64url')), claims = JSON.parse(Buffer.from(payload, 'base64url'))
  assert.equal(h.alg, 'RS256'); assert.equal(claims.sub, subject)
  assert.equal(claims.iss, expectedIssuer); assert.ok(claims.exp > Date.now()/1000)
  assert.equal(claims.exp - claims.iat, expectedAccessTokenTtl,
    `Authentication JWT lifetime must be ${expectedAccessTokenTtl} seconds`)
  const jwks = await (await fetch(new URL('/.well-known/jwks.json', httpBaseUrl))).json()
  const key = jwks.keys.find(k => k.kid === h.kid)
  assert.ok(key && !key.d, 'Public JWKS must contain the active signing key')
  assert.ok(verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), createPublicKey({key, format: 'jwk'}), Buffer.from(signature, 'base64url')), 'JWT signature verification failed')
  console.log(`API_KEY_ISSUANCE_AND_SIGNED_JWT_OK access_token_ttl_seconds=${claims.exp-claims.iat}`)
  const replacement = await internal(`/v1/api-keys/${oldId}/rotate`, 'POST')
  const newId = keyId(replacement.api_key)
  exchange(replacement.api_key); exchange(issued.api_key)
  console.log('API_KEY_ROTATION_AND_CONFIGURED_OVERLAP_OK')
  await internal(`/v1/api-keys/${oldId}`, 'DELETE'); exchange(issued.api_key, true)
  await internal(`/v1/api-keys/${newId}`, 'DELETE'); exchange(replacement.api_key, true)
  console.log('API_KEY_REVOCATION_DENIAL_OK')
} finally {
  let cleanupFailed = false
  for (const id of keyIds) {
    try { await internal(`/v1/api-keys/${id}`, 'DELETE') } catch { cleanupFailed = true }
  }
  try { await internal(`/v1/service-accounts/${subject}/revoke`, 'POST') } catch { cleanupFailed = true }
  assert.ok(!cleanupFailed, 'Fixture cleanup failed; operator review needed')
  console.log('FIXTURE_KEYS_REVOKED_AND_PRINCIPAL_DISABLED')
}

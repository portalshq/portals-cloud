#!/usr/bin/env node
// A two-step live browser test. The one-time login URL goes only to stdout;
// access and refresh credentials remain in this process and never enter argv.
import assert from 'node:assert/strict'
import {createHash, createPublicKey, randomUUID, verify} from 'node:crypto'
import {readFileSync, writeFileSync, unlinkSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {setTimeout as delay} from 'node:timers/promises'
import grpc from '@grpc/grpc-js'
import protoLoader from '@grpc/proto-loader'
import {validateOidcDiscovery} from './test-oidc-provider.mjs'

const PROTO = resolve(import.meta.dirname, '../../lore/lore/lore-proto/proto/auth_api.proto')
const SERVICE = grpc.loadPackageDefinition(protoLoader.loadSync(PROTO, {
  keepCase: false, longs: String, enums: String, defaults: true, oneofs: true,
})).epic_urc.UrcAuthApi

function json(path) { return JSON.parse(readFileSync(path, 'utf8')) }
function requiredString(value, name) {
  assert.ok(typeof value === 'string' && value && !value.includes('__REPLACE_'), `${name} must be configured`)
  return value
}
export function validateProfile(profile) {
  assert.equal(profile.schemaVersion, 1)
  assert.equal(profile.disposableTestIdentity, true, 'Use only an approved disposable OIDC test identity')
  for (const field of ['authGrpcTarget', 'authHttpBase', 'authIssuer', 'oidcIssuer', 'oidcClientId', 'oidcRedirectUri', 'expectedSubject']) requiredString(profile[field], field)
  assert.match(profile.authGrpcTarget, /^[A-Za-z0-9.-]+:[1-9][0-9]{0,4}$/)
  const base = new URL(profile.authHttpBase)
  const callback = new URL(profile.oidcRedirectUri)
  assert.equal(base.protocol, 'https:'); assert.equal(callback.protocol, 'https:')
  assert.equal(callback.href, new URL('/callback', base).href, 'The registered redirect must be this Auth endpoint /callback')
  assert.equal(new URL(profile.authIssuer).protocol, 'https:')
  assert.equal(new URL(profile.oidcIssuer).protocol, 'https:')
  assert.ok(Number.isInteger(profile.expectedAccessTokenTtlSeconds) && profile.expectedAccessTokenTtlSeconds >= 60 && profile.expectedAccessTokenTtlSeconds <= 3600)
  return profile
}

function rpc(client, method, request = {}, bearer) {
  const metadata = new grpc.Metadata()
  if (bearer) metadata.set('authorization', `Bearer ${bearer}`)
  return new Promise((resolveResult, reject) => client[method](request, metadata, {deadline: Date.now() + 12000}, (error, response) => error ? reject(error) : resolveResult(response)))
}

async function getJson(url) {
  const response = await fetch(url, {redirect: 'error', signal: AbortSignal.timeout(12000), headers: {accept: 'application/json'}})
  assert.equal(response.status, 200, `Expected HTTP 200 at ${new URL(url).pathname}`)
  return response.json()
}

export function verifyAuthJwt(token, jwks, profile) {
  assert.equal(typeof token, 'string')
  const parts = token.split('.')
  assert.equal(parts.length, 3, 'JWT must have three parts')
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  assert.equal(header.alg, 'RS256')
  assert.equal(typeof header.kid, 'string')
  const key = jwks.keys.find(item => item.kid === header.kid && item.kty === 'RSA' && item.alg === 'RS256' && item.use === 'sig' && !item.d)
  assert.ok(key, 'Published JWKS does not contain the active public signing key')
  assert.ok(verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({key, format: 'jwk'}), Buffer.from(parts[2], 'base64url')), 'JWT signature is invalid')
  assert.equal(claims.iss, profile.authIssuer)
  assert.equal(claims.sub, profile.expectedSubject)
  assert.ok(Array.isArray(claims.aud) && claims.aud.includes('lore') && claims.aud.includes('portals.works'))
  assert.equal(claims.idp, profile.oidcIssuer)
  assert.equal(claims.is_service_account, false)
  assert.ok(Number.isInteger(claims.iat) && Number.isInteger(claims.exp))
  assert.equal(claims.exp - claims.iat, profile.expectedAccessTokenTtlSeconds)
  assert.ok(claims.exp > Date.now() / 1000, 'JWT is already expired')
  return {kid: header.kid, subjectHash: createHash('sha256').update(claims.sub).digest('hex'), ttlSeconds: claims.exp - claims.iat}
}

async function checkProvider(profile) {
  const discovery = await getJson(`${profile.oidcIssuer.replace(/\/$/, '')}/.well-known/openid-configuration`)
  const jwks = await getJson(discovery.jwks_uri)
  validateOidcDiscovery(profile.oidcIssuer, discovery, jwks)
  return discovery
}

async function run() {
  const [phase, profilePath, sessionPath, reportPath] = process.argv.slice(2)
  assert.ok(['begin', 'finish'].includes(phase), 'Usage: test-oidc-browser-acceptance.mjs begin PROFILE.json SESSION.json | finish PROFILE.json SESSION.json REPORT.json')
  assert.ok(profilePath && sessionPath && (phase === 'begin' || reportPath))
  const profile = validateProfile(json(profilePath))
  const discovery = await checkProvider(profile)
  const client = new SERVICE(profile.authGrpcTarget, grpc.credentials.createSsl(), {'grpc.max_receive_message_length': 1024 * 1024})
  try {
    if (phase === 'begin') {
      const clientState = randomUUID()
      const session = await rpc(client, 'startAuthSession', {clientState})
      const login = new URL(requiredString(session.loginUrl, 'loginUrl'))
      const expected = new URL(discovery.authorization_endpoint)
      assert.equal(login.origin + login.pathname, expected.origin + expected.pathname)
      assert.equal(login.searchParams.get('client_id'), profile.oidcClientId)
      assert.equal(login.searchParams.get('redirect_uri'), profile.oidcRedirectUri)
      assert.equal(login.searchParams.get('code_challenge_method'), 'S256')
      assert.match(login.searchParams.get('code_challenge') || '', /^[A-Za-z0-9_-]{43}$/)
      assert.match(session.sessionCode, /^[0-9a-f-]{36}$/i)
      writeFileSync(sessionPath, JSON.stringify({clientState, sessionCode: session.sessionCode, createdAt: Date.now(), authGrpcTarget: profile.authGrpcTarget}), {flag: 'wx', mode: 0o600})
      process.stdout.write(`OIDC_BROWSER_LOGIN_URL=${login.href}\n`)
      process.stdout.write('Sign in with the disposable non-admin test user, then run the finish phase within five minutes.\n')
      return
    }
    const session = json(sessionPath)
    assert.equal(session.authGrpcTarget, profile.authGrpcTarget)
    assert.ok(Date.now() - session.createdAt < 300000, 'Browser session expired; begin a new test')
    let issued
    while (Date.now() - session.createdAt < 300000) {
      const result = await rpc(client, 'getAuthSession', {clientState: session.clientState, sessionCode: session.sessionCode})
      if (result.userToken?.userToken) { issued = result.userToken; break }
      await delay(2000)
    }
    assert.ok(issued, 'No completed browser callback within five minutes')
    assert.ok(issued.refreshToken, 'Browser session did not receive a refresh credential')
    const jwks = await getJson(new URL('/.well-known/jwks.json', profile.authHttpBase))
    const first = verifyAuthJwt(issued.userToken, jwks, profile)
    const rotated = (await rpc(client, 'refreshAuthSession', {}, issued.refreshToken)).userToken
    assert.ok(rotated?.refreshToken && rotated.refreshToken !== issued.refreshToken, 'Refresh credential did not rotate')
    const second = verifyAuthJwt(rotated.userToken, jwks, profile)
    assert.equal(first.subjectHash, second.subjectHash)
    let replayRejected = false
    try { await rpc(client, 'refreshAuthSession', {}, issued.refreshToken) }
    catch (error) { replayRejected = error.code === grpc.status.PERMISSION_DENIED }
    assert.ok(replayRejected, 'Consumed refresh credential was not rejected as replay')
    let successorRevoked = false
    try { await rpc(client, 'refreshAuthSession', {}, rotated.refreshToken) }
    catch (error) { successorRevoked = [grpc.status.UNAUTHENTICATED, grpc.status.PERMISSION_DENIED].includes(error.code) }
    assert.ok(successorRevoked, 'Replay did not revoke the refresh family')
    // Revoke is idempotent and also records the logout audit event.
    await rpc(client, 'revokeAuthSession', {}, rotated.refreshToken)
    writeFileSync(reportPath, JSON.stringify({schemaVersion: 1, timestamp: new Date().toISOString(), passed: true,
      scope: 'live browser callback, Auth JWT, refresh rotation and replay-family revocation',
      subjectSha256: first.subjectHash, authIssuer: profile.authIssuer, oidcIssuer: profile.oidcIssuer,
      authSigningKid: first.kid, ttlSeconds: first.ttlSeconds,
      results: ['browser_callback', 'jwt_signature_and_claims', 'refresh_rotation', 'replay_rejection', 'family_revocation', 'logout_request'].map(check => ({check, status: 'passed'})),
      remaining: ['audit database query', 'signing-key overlap under an approved rotation window', 'PX/Lore network renewal and repository isolation'],
    }, null, 2) + '\n', {flag: 'wx', mode: 0o600})
    unlinkSync(sessionPath)
    process.stdout.write('OIDC_BROWSER_ACCEPTANCE=PASS; sanitized report written. Audit and key-overlap gates remain separate.\n')
  } finally { client.close() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run().catch(error => {
    console.error(`OIDC_BROWSER_ACCEPTANCE_FAILED ${String(error.message).split('\n')[0]}`)
    process.exitCode = 1
  })
}

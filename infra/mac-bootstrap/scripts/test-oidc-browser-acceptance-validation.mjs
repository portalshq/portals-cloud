import assert from 'node:assert/strict'
import {generateKeyPairSync, sign} from 'node:crypto'
import {validateProfile, verifyAuthJwt} from './test-oidc-browser-acceptance.mjs'

const profile = validateProfile({schemaVersion: 1, disposableTestIdentity: true,
  authGrpcTarget: 'auth.example.test:443', authHttpBase: 'https://auth.example.test',
  authIssuer: 'https://auth.example.test', oidcIssuer: 'https://idp.example.test',
  oidcClientId: 'client', oidcRedirectUri: 'https://auth.example.test/callback',
  expectedSubject: 'test-subject', expectedAccessTokenTtlSeconds: 900})
assert.throws(() => validateProfile({...profile, disposableTestIdentity: false}), /disposable/)
assert.throws(() => validateProfile({...profile, oidcRedirectUri: 'https://other.example.test/callback'}), /registered redirect/)
const {privateKey, publicKey} = generateKeyPairSync('rsa', {modulusLength: 2048})
const key = {...publicKey.export({format: 'jwk'}), kid: 'test-key', alg: 'RS256', use: 'sig'}
const header = Buffer.from(JSON.stringify({alg: 'RS256', kid: key.kid})).toString('base64url')
const claims = {iss: profile.authIssuer, idp: profile.oidcIssuer, sub: profile.expectedSubject,
  aud: ['lore', 'portals.works'], iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+900,
  is_service_account: false}
const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
const signature = sign('RSA-SHA256', Buffer.from(`${header}.${body}`), privateKey).toString('base64url')
const jwt = `${header}.${body}.${signature}`
assert.equal(verifyAuthJwt(jwt, {keys: [key]}, profile).ttlSeconds, 900)
assert.throws(() => verifyAuthJwt(jwt, {keys: []}, profile), /published JWKS/i)
assert.throws(() => verifyAuthJwt(`${header}.${body}.bad`, {keys: [key]}, profile), /signature/i)
assert.throws(() => verifyAuthJwt(jwt, {keys: [key]}, {...profile, expectedSubject: 'wrong'}), /Expected values to be strictly equal/)
assert.throws(() => verifyAuthJwt(jwt, {keys: [key]}, {...profile, expectedAccessTokenTtlSeconds: 3600}), /Expected values to be strictly equal/)
console.log('OIDC browser acceptance contract passed: scoped fixture, exact callback, signature, subject and TTL')

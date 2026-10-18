import assert from 'node:assert/strict'
import {validateOidcDiscovery} from './test-oidc-provider.mjs'

const issuer = 'https://idp.example.test'
const discovery = {
  issuer,
  authorization_endpoint: `${issuer}/oauth/v2/authorize`,
  token_endpoint: `${issuer}/oauth/v2/token`,
  jwks_uri: `${issuer}/oauth/v2/keys`,
  response_types_supported: ['code', 'id_token'],
  code_challenge_methods_supported: ['S256'],
}
const jwks = {keys: [
  {kid: 'current', kty: 'RSA', alg: 'RS256', use: 'sig', n: 'modulus', e: 'AQAB'},
  {kid: 'overlap', kty: 'RSA', alg: 'RS256', use: 'sig', n: 'other-modulus', e: 'AQAB'},
]}

assert.equal(validateOidcDiscovery(issuer, discovery, jwks).signingKids.length, 2)
assert.throws(() => validateOidcDiscovery(`${issuer}/different`, discovery, jwks), /issuer does not exactly match/)
assert.throws(() => validateOidcDiscovery(issuer, {...discovery, authorization_endpoint: 'http://idp.example.test/authorize'}, jwks), /HTTPS URL/)
assert.throws(() => validateOidcDiscovery(issuer, {...discovery, code_challenge_methods_supported: ['plain']}, jwks), /PKCE S256/)
assert.throws(() => validateOidcDiscovery(issuer, discovery, {keys: [{kid: 'ec', kty: 'EC', alg: 'ES256', use: 'sig'}]}), /RSA\/RS256/)
assert.throws(() => validateOidcDiscovery(issuer, discovery, {keys: [jwks.keys[0], jwks.keys[0]]}), /duplicate key IDs/)

console.log('OIDC provider contract tests passed: issuer binding, HTTPS, PKCE S256, RS256 support, and unique signing-key IDs')

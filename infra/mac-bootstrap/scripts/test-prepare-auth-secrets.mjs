import assert from 'node:assert/strict'
import {execFileSync, spawnSync} from 'node:child_process'
import {createPrivateKey, createPublicKey, generateKeyPairSync} from 'node:crypto'
import {chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'portals-auth-secret-test-'))
const script = new URL('./prepare-auth-secrets.mjs', import.meta.url).pathname
const authEnv = join(root, 'auth.env')
const command = (...extra) => ['--auth-env', authEnv, '--secrets-dir', root, ...extra]
try {
  chmodSync(root, 0o700)
  writeFileSync(authEnv, 'JWT_KID=test-kid\n', {mode: 0o600})
  const {privateKey, publicKey} = generateKeyPairSync('rsa', {modulusLength: 2048})
  const privateJwk = {...privateKey.export({format: 'jwk'}), kid: 'test-kid'}
  const publicJwk = {...publicKey.export({format: 'jwk'}), kid: 'test-kid', alg: 'RS256', use: 'sig'}
  const privateJwkPath = join(root, 'jwt-signing.jwk')
  const publicJwkPath = join(root, 'jwt-signing.pub.jwk')
  const jwksPath = join(root, 'jwks.json')
  writeFileSync(privateJwkPath, JSON.stringify(privateJwk), {mode: 0o600})
  writeFileSync(publicJwkPath, JSON.stringify(publicJwk), {mode: 0o600})
  writeFileSync(jwksPath, JSON.stringify({keys: [publicJwk]}), {mode: 0o600})

  const initial = execFileSync(process.execPath, [script, ...command()], {encoding: 'utf8'})
  assert.match(initial, /signing-key: missing/)
  assert.match(initial, /api-key-pepper: missing/)
  execFileSync(process.execPath, [script, ...command('--install-key', '--create-new-pepper')])
  const pemPath = join(root, 'signing-key')
  const pepperPath = join(root, 'api-key-pepper')
  const pem = readFileSync(pemPath, 'utf8')
  assert.match(pem, /^-----BEGIN PRIVATE KEY-----/)
  assert.equal(createPublicKey(createPrivateKey(pem)).export({format: 'jwk'}).n, publicJwk.n)
  assert.equal(Buffer.from(readFileSync(pepperPath, 'utf8').trim(), 'base64').length, 32)
  assert.equal(statSync(pemPath).mode & 0o777, 0o400)
  assert.equal(statSync(pepperPath).mode & 0o777, 0o400)
  execFileSync(process.execPath, [script, ...command('--install-key', '--create-new-pepper')])
  assert.equal(readFileSync(pemPath, 'utf8'), pem)

  writeFileSync(authEnv, 'JWT_KID=wrong-kid\n', {mode: 0o600})
  const rejectedKid = spawnSync(process.execPath, [script, ...command()], {encoding: 'utf8'})
  assert.notEqual(rejectedKid.status, 0)
  assert.match(rejectedKid.stderr, /jwt-signing.jwk must contain the private key for JWT_KID/)
  writeFileSync(authEnv, 'JWT_KID=test-kid\n', {mode: 0o600})

  const otherKey = generateKeyPairSync('rsa', {modulusLength: 2048}).publicKey.export({format: 'jwk'})
  writeFileSync(publicJwkPath, JSON.stringify({...otherKey, kid: 'test-kid'}), {mode: 0o600})
  const rejectedPublic = spawnSync(process.execPath, [script, ...command()], {encoding: 'utf8'})
  assert.notEqual(rejectedPublic.status, 0)
  assert.match(rejectedPublic.stderr, /jwt-signing.pub.jwk does not match/)
  assert.equal(readFileSync(pemPath, 'utf8'), pem)

  writeFileSync(publicJwkPath, JSON.stringify(publicJwk), {mode: 0o600})
  writeFileSync(jwksPath, JSON.stringify({keys: [privateJwk]}), {mode: 0o600})
  const rejectedPrivateJwks = spawnSync(process.execPath, [script, ...command()], {encoding: 'utf8'})
  assert.notEqual(rejectedPrivateJwks.status, 0)
  assert.match(rejectedPrivateJwks.stderr, /jwks.json must contain public keys only/)
  assert.equal(readFileSync(pemPath, 'utf8'), pem)

  writeFileSync(jwksPath, JSON.stringify({keys: [{...publicJwk, q: privateJwk.q}]}), {mode: 0o600})
  const rejectedPartialPrivateJwks = spawnSync(process.execPath, [script, ...command()], {encoding: 'utf8'})
  assert.notEqual(rejectedPartialPrivateJwks.status, 0)
  assert.match(rejectedPartialPrivateJwks.stderr, /jwks.json must contain public keys only/)
  assert.equal(readFileSync(pemPath, 'utf8'), pem)

  const ecDir = join(root, 'archived-ec')
  mkdirSync(ecDir, {mode: 0o700})
  const ecAuthEnv = join(ecDir, 'auth.env')
  const ecArgs = (...extra) => ['--auth-env', ecAuthEnv, '--secrets-dir', ecDir, ...extra]
  writeFileSync(ecAuthEnv, 'JWT_KID=fresh-rsa-kid\n', {mode: 0o600})
  const ecPair = generateKeyPairSync('ec', {namedCurve: 'prime256v1'})
  const ecPrivateJwk = {...ecPair.privateKey.export({format: 'jwk'}), kid: 'archived-ec-kid', alg: 'ES256', use: 'sig'}
  const ecPublicJwk = {...ecPair.publicKey.export({format: 'jwk'}), kid: 'archived-ec-kid', alg: 'ES256', use: 'sig'}
  writeFileSync(join(ecDir, 'jwt-signing.jwk'), JSON.stringify(ecPrivateJwk), {mode: 0o600})
  writeFileSync(join(ecDir, 'jwt-signing.pub.jwk'), JSON.stringify(ecPublicJwk), {mode: 0o600})
  writeFileSync(join(ecDir, 'jwks.json'), JSON.stringify({keys: [ecPublicJwk]}), {mode: 0o600})
  const ecInspection = spawnSync(process.execPath, [script, ...ecArgs()], {encoding: 'utf8'})
  assert.notEqual(ecInspection.status, 0)
  assert.match(ecInspection.stderr, /archived JWK is not RSA/)
  const missingConfirmation = spawnSync(process.execPath, [script, ...ecArgs('--generate-new-rsa-key')], {encoding: 'utf8'})
  assert.notEqual(missingConfirmation.status, 0)
  assert.match(missingConfirmation.stderr, /requires --confirm-fresh-identity/)
  execFileSync(process.execPath, [script, ...ecArgs(
    '--generate-new-rsa-key', '--confirm-fresh-identity', '--create-new-pepper',
  )])
  const freshPem = readFileSync(join(ecDir, 'signing-key'), 'utf8')
  assert.match(freshPem, /^-----BEGIN PRIVATE KEY-----/)
  assert.equal(createPrivateKey(freshPem).asymmetricKeyDetails.modulusLength, 3072)
  assert.equal(statSync(join(ecDir, 'signing-key')).mode & 0o777, 0o400)
  assert.equal(Buffer.from(readFileSync(join(ecDir, 'api-key-pepper'), 'utf8').trim(), 'base64').length, 32)
  execFileSync(process.execPath, [script, ...ecArgs()])
  const rejectRegeneration = spawnSync(process.execPath, [script, ...ecArgs(
    '--generate-new-rsa-key', '--confirm-fresh-identity', '--create-new-pepper',
  )], {encoding: 'utf8'})
  assert.notEqual(rejectRegeneration.status, 0)
  assert.match(rejectRegeneration.stderr, /an RSA signing identity already exists/)
  assert.equal(readFileSync(join(ecDir, 'signing-key'), 'utf8'), freshPem)
  writeFileSync(ecAuthEnv, 'JWT_KID=archived-ec-kid\n', {mode: 0o600})
  const rejectKidCollision = spawnSync(process.execPath, [script, ...ecArgs()], {encoding: 'utf8'})
  assert.notEqual(rejectKidCollision.status, 0)
  assert.match(rejectKidCollision.stderr, /JWT_KID collides with the archived non-RSA JWK/)
  console.log('Existing RSA JWK conversion, pepper generation, idempotency, and mismatch rejection passed')
} finally {
  rmSync(root, {recursive: true, force: true})
}

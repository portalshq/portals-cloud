#!/usr/bin/env node
// Convert an existing, matching RSA JWK to the PKCS#8 file Auth Gateway reads.
// Never print key material or replace an existing signing key or pepper.
import {
  closeSync, constants, existsSync, fsyncSync, openSync, readFileSync,
  rmSync, statSync, writeFileSync,
} from 'node:fs'
import {createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes} from 'node:crypto'
import {resolve} from 'node:path'

const args = process.argv.slice(2)
const option = (name) => {
  const index = args.indexOf(name)
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) {
    throw new Error(`${name} must be followed by a path`)
  }
  return resolve(args[index + 1])
}
const authEnv = option('--auth-env')
const secretsDir = option('--secrets-dir')
const installKey = args.includes('--install-key')
const generateNewRsaKey = args.includes('--generate-new-rsa-key')
const confirmFreshIdentity = args.includes('--confirm-fresh-identity')
const createPepper = args.includes('--create-new-pepper')
const allowed = new Set([
  '--auth-env', '--secrets-dir', '--install-key', '--generate-new-rsa-key',
  '--confirm-fresh-identity', '--create-new-pepper',
])
for (let index = 0; index < args.length; index += 1) {
  if (!allowed.has(args[index])) throw new Error(`unknown argument: ${args[index]}`)
  if (args[index] === '--auth-env' || args[index] === '--secrets-dir') index += 1
}
if (installKey && generateNewRsaKey) {
  throw new Error('--install-key and --generate-new-rsa-key are mutually exclusive')
}
if (generateNewRsaKey !== confirmFreshIdentity) {
  throw new Error('--generate-new-rsa-key requires --confirm-fresh-identity (and vice versa)')
}

const serviceUid = process.getuid?.()
function requirePrivate(path, kind) {
  const stat = statSync(path)
  if (kind === 'directory' ? !stat.isDirectory() : !stat.isFile()) {
    throw new Error(`${path} must be a ${kind}`)
  }
  if (serviceUid !== undefined && stat.uid !== serviceUid) {
    throw new Error(`${path} must be owned by the current service account`)
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new Error(`${path} must not be accessible to group or other users`)
  }
}
requirePrivate(secretsDir, 'directory')
requirePrivate(authEnv, 'file')
const kidEntries = [...readFileSync(authEnv, 'utf8').matchAll(/^JWT_KID=(.*)$/gm)]
if (kidEntries.length !== 1 || !kidEntries[0][1] || /__REPLACE_|^['"]/.test(kidEntries[0][1])) {
  throw new Error('auth.env must contain exactly one unquoted, resolved JWT_KID')
}
const kid = kidEntries[0][1]
const privateJwkPath = resolve(secretsDir, 'jwt-signing.jwk')
const publicJwkPath = resolve(secretsDir, 'jwt-signing.pub.jwk')
const jwksPath = resolve(secretsDir, 'jwks.json')
const signingKeyPath = resolve(secretsDir, 'signing-key')
const pepperPath = resolve(secretsDir, 'api-key-pepper')

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}
function singleKey(value, label) {
  const keys = Array.isArray(value?.keys) ? value.keys : [value]
  if (keys.length !== 1 || !keys[0] || typeof keys[0] !== 'object') {
    throw new Error(`${label} must contain exactly one JWK`)
  }
  return keys[0]
}
function matches(left, right) {
  return left?.n === right?.n && left?.e === right?.e
}
function checkPublic(key, label, expected) {
  if (key.kty !== 'RSA' || key.kid !== kid || !matches(key, expected)) {
    throw new Error(`${label} does not match JWT_KID and the signing key`)
  }
  if (key.alg && key.alg !== 'RS256') throw new Error(`${label} must use RS256`)
  if (key.use && key.use !== 'sig') throw new Error(`${label} must be a signing key`)
  if (['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'].some((field) => Object.hasOwn(key, field))) {
    throw new Error(`${label} must not contain a private RSA component`)
  }
}

let privateKey
let derivedPublic
if (existsSync(privateJwkPath)) {
  requirePrivate(privateJwkPath, 'file')
  const jwk = singleKey(readJson(privateJwkPath), 'jwt-signing.jwk')
  if (jwk.kty !== 'RSA') {
    if (jwk.kid === kid) {
      throw new Error('JWT_KID collides with the archived non-RSA JWK; choose a new unique JWT_KID')
    }
    if (!existsSync(signingKeyPath) && !generateNewRsaKey) {
      throw new Error('archived JWK is not RSA; Auth requires a new RSA PKCS#8 signing-key')
    }
  } else if (!jwk.kid || jwk.kid === kid) {
    if (!jwk.d) throw new Error('jwt-signing.jwk must contain the private key for JWT_KID')
    privateKey = createPrivateKey({key: jwk, format: 'jwk'})
    if (privateKey.asymmetricKeyType !== 'rsa' || privateKey.asymmetricKeyDetails.modulusLength < 2048) {
      throw new Error('JWT signing key must be RSA with at least 2048 bits')
    }
    derivedPublic = createPublicKey(privateKey).export({format: 'jwk'})
    if (!matches(jwk, derivedPublic)) throw new Error('private JWK public components are inconsistent')
  } else {
    throw new Error('jwt-signing.jwk must contain the private key for JWT_KID')
  }
}
if (existsSync(signingKeyPath)) {
  requirePrivate(signingKeyPath, 'file')
  const existingPem = readFileSync(signingKeyPath, 'utf8')
  if (!existingPem.startsWith('-----BEGIN PRIVATE KEY-----')) {
    throw new Error('existing signing-key must be an unencrypted PKCS#8 PEM key')
  }
  const existing = createPrivateKey(existingPem)
  if (existing.asymmetricKeyType !== 'rsa' || existing.asymmetricKeyDetails.modulusLength < 2048) {
    throw new Error('existing signing-key must be RSA with at least 2048 bits')
  }
  const existingPublic = createPublicKey(existing).export({format: 'jwk'})
  if (derivedPublic && !matches(derivedPublic, existingPublic)) {
    throw new Error('existing signing-key does not match jwt-signing.jwk; it was preserved')
  }
  derivedPublic = existingPublic
}
if (generateNewRsaKey && (existsSync(signingKeyPath) || derivedPublic)) {
  throw new Error('refusing to generate: an RSA signing identity already exists')
}
if (existsSync(publicJwkPath)) {
  const publicJwk = singleKey(readJson(publicJwkPath), 'jwt-signing.pub.jwk')
  if (publicJwk.kid === kid) {
    if (!derivedPublic) throw new Error('JWT_KID collides with an archived public JWK')
    checkPublic(publicJwk, 'jwt-signing.pub.jwk', derivedPublic)
  }
} else if (installKey && !existsSync(signingKeyPath)) {
  throw new Error('jwt-signing.pub.jwk is required before converting the private JWK')
}
if (existsSync(jwksPath)) {
  const value = readJson(jwksPath)
  if (!Array.isArray(value?.keys)) throw new Error('jwks.json must have a keys array')
  if (value.keys.some((key) =>
    key && ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'].some((field) => Object.hasOwn(key, field)))) {
    throw new Error('jwks.json must contain public keys only')
  }
  const matching = value.keys.filter((key) => key.kid === kid)
  if (matching.length > 1) throw new Error('jwks.json contains a duplicate JWT_KID')
  if (matching.length === 1) {
    if (!derivedPublic) throw new Error('JWT_KID collides with an archived JWKS key')
    checkPublic(matching[0], 'jwks.json', derivedPublic)
  } else if (installKey) {
    throw new Error('jwks.json must include the RSA key for JWT_KID before JWK conversion')
  }
}
if (!derivedPublic && !generateNewRsaKey) {
  throw new Error('neither an active RSA signing-key nor a convertible RSA JWK exists')
}

function createOnce(path, contents) {
  let fd
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o400)
    writeFileSync(fd, contents)
    fsyncSync(fd)
    closeSync(fd)
  } catch (error) {
    if (fd !== undefined) {
      try { closeSync(fd) } catch { /* already closed */ }
      rmSync(path, {force: true})
    }
    throw error
  }
}

if (generateNewRsaKey) {
  const {privateKey: freshKey} = generateKeyPairSync('rsa', {
    modulusLength: 3072,
    publicExponent: 0x10001,
  })
  createOnce(signingKeyPath, freshKey.export({format: 'pem', type: 'pkcs8'}))
  console.log('Created a new RSA/RS256 signing-key (3072-bit PKCS#8 PEM, mode 0400).')
} else if (installKey && !existsSync(signingKeyPath)) {
  if (!privateKey) throw new Error('jwt-signing.jwk is required to install signing-key')
  const pem = privateKey.export({format: 'pem', type: 'pkcs8'})
  createOnce(signingKeyPath, pem)
  console.log('Installed signing-key from matching private JWK (PKCS#8 PEM, mode 0400).')
} else {
  console.log(`signing-key: ${existsSync(signingKeyPath) ? 'present and validated' : 'missing'}`)
}

if (createPepper && !existsSync(pepperPath)) {
  createOnce(pepperPath, `${randomBytes(32).toString('base64')}\n`)
  console.log('Created a new API-key pepper (32 random bytes, mode 0400).')
} else if (existsSync(pepperPath)) {
  requirePrivate(pepperPath, 'file')
  const encoded = readFileSync(pepperPath, 'utf8').trim()
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded) || Buffer.from(encoded, 'base64').length !== 32) {
    throw new Error('api-key-pepper must be base64 encoding of exactly 32 bytes')
  }
  console.log('api-key-pepper: present and validated')
} else {
  console.log('api-key-pepper: missing; create only if this is a new API-key identity')
}

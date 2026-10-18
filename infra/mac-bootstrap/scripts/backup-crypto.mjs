import assert from 'node:assert/strict'
import {createCipheriv, createDecipheriv, randomBytes, scryptSync} from 'node:crypto'
import {readFileSync, statSync, writeFileSync} from 'node:fs'

const header = Buffer.from('PORTALS_BACKUP_V1\n')
function encrypt(plain, password) {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', scryptSync(password, salt, 32), iv)
  cipher.setAAD(header)
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([header, salt, iv, cipher.getAuthTag(), encrypted])
}
function decrypt(bundle, password) {
  assert.ok(bundle.length >= header.length + 44 && bundle.subarray(0, header.length).equals(header), 'unsupported/incomplete backup format')
  const offset = header.length
  const cipher = createDecipheriv('aes-256-gcm', scryptSync(password, bundle.subarray(offset, offset + 16), 32), bundle.subarray(offset + 16, offset + 28))
  cipher.setAAD(header)
  cipher.setAuthTag(bundle.subarray(offset + 28, offset + 44))
  return Buffer.concat([cipher.update(bundle.subarray(offset + 44)), cipher.final()])
}
if (process.argv.includes('--self-test')) {
  const password = randomBytes(32)
  const plain = Buffer.from('test-only recovery manifest')
  const bundle = encrypt(plain, password)
  assert.deepEqual(decrypt(bundle, password), plain)
  assert.throws(() => decrypt(bundle, randomBytes(32)))
  bundle[bundle.length - 1] ^= 1
  assert.throws(() => decrypt(bundle, password))
  console.log('Authenticated backup round-trip, wrong-key rejection, and tamper rejection passed')
} else {
  const [operation, source, destination, keyFile] = process.argv.slice(2)
  assert.ok(['encrypt', 'decrypt'].includes(operation) && source && destination && keyFile, 'usage: backup-crypto.mjs encrypt|decrypt source destination key-file')
  assert.ok(statSync(source).size <= 32 * 1024 * 1024, 'recovery manifest bundle exceeds 32 MiB; provider data requires separate backups')
  assert.ok((statSync(keyFile).mode & 0o077) === 0, 'backup key must not be group/world accessible')
  const password = readFileSync(keyFile)
  assert.ok(password.length >= 32 && password.length <= 4096, 'use an off-Mac-escrowed random backup key of at least 32 bytes')
  const result = (operation === 'encrypt' ? encrypt : decrypt)(readFileSync(source), password)
  // Never overwrite an existing backup or expose unauthenticated plaintext.
  writeFileSync(destination, result, {flag: 'wx', mode: 0o600})
  console.log(`Authenticated backup ${operation} completed`)
}

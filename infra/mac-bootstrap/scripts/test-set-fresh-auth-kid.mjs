import assert from 'node:assert/strict'
import {execFileSync, spawnSync} from 'node:child_process'
import {generateKeyPairSync} from 'node:crypto'
import {chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'portals-fresh-auth-kid-test-'))
try {
  chmodSync(root, 0o700)
  const dir = join(root, 'auth')
  mkdirSync(dir, {mode: 0o700})
  const authEnv = join(root, 'auth.env')
  const secret = 'DO_NOT_PRINT_DATABASE_PASSWORD'
  writeFileSync(authEnv, `DATABASE_URL=${secret}\nJWT_KID=old-ec-kid\nRUST_LOG=info\n`, {mode: 0o600})
  const ec = generateKeyPairSync('ec', {namedCurve: 'prime256v1'})
  const archived = {...ec.privateKey.export({format: 'jwk'}), kid: 'old-ec-kid'}
  const archivedPublic = {...ec.publicKey.export({format: 'jwk'}), kid: 'old-ec-kid'}
  writeFileSync(join(dir, 'jwt-signing.jwk'), JSON.stringify(archived), {mode: 0o600})
  writeFileSync(join(dir, 'jwt-signing.pub.jwk'), JSON.stringify(archivedPublic), {mode: 0o600})
  writeFileSync(join(dir, 'jwks.json'), JSON.stringify({keys: [archivedPublic]}), {mode: 0o600})
  const script = new URL('./set-fresh-auth-kid.mjs', import.meta.url).pathname
  const args = ['--auth-env', authEnv, '--secrets-dir', dir, '--confirm-fresh-identity']

  const noConfirm = spawnSync(process.execPath, [script, ...args.slice(0, -1)], {encoding: 'utf8'})
  assert.notEqual(noConfirm.status, 0)
  assert.match(readFileSync(authEnv, 'utf8'), /JWT_KID=old-ec-kid/)

  const output = execFileSync(process.execPath, [script, ...args], {encoding: 'utf8'})
  assert.match(output, /New public JWT_KID: auth-[0-9a-f-]{36}/)
  assert.doesNotMatch(output, new RegExp(secret))
  const changed = readFileSync(authEnv, 'utf8')
  assert.match(changed, new RegExp(`DATABASE_URL=${secret}`))
  assert.match(changed, /RUST_LOG=info/)
  assert.match(changed, /JWT_KID=auth-[0-9a-f-]{36}/)
  assert.equal(statSync(authEnv).mode & 0o777, 0o600)
  assert.equal(readFileSync(join(dir, 'jwt-signing.jwk'), 'utf8'), JSON.stringify(archived))

  const repeat = spawnSync(process.execPath, [script, ...args], {encoding: 'utf8'})
  assert.notEqual(repeat.status, 0)
  assert.match(repeat.stderr, /JWT_KID no longer matches/)
  assert.equal(readFileSync(authEnv, 'utf8'), changed)
  const prepare = new URL('./prepare-auth-secrets.mjs', import.meta.url).pathname
  execFileSync(process.execPath, [prepare, '--auth-env', authEnv, '--secrets-dir', dir,
    '--generate-new-rsa-key', '--confirm-fresh-identity', '--create-new-pepper'])
  assert.match(readFileSync(join(dir, 'signing-key'), 'utf8'), /^-----BEGIN PRIVATE KEY-----/)
  assert.equal(statSync(join(dir, 'signing-key')).mode & 0o777, 0o400)
  assert.equal(statSync(join(dir, 'api-key-pepper')).mode & 0o777, 0o400)
  execFileSync(process.execPath, [prepare, '--auth-env', authEnv, '--secrets-dir', dir])
  console.log('Fresh Auth JWT_KID assignment and RSA/pepper initialization preserve archived EC material')
} finally {
  rmSync(root, {recursive: true, force: true})
}

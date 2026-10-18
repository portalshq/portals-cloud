import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'portals-key-shape-test-'))
try {
  const file = join(dir, 'key.jwk')
  const secret = 'DO_NOT_PRINT_THIS_PRIVATE_KEY_VALUE'
  writeFileSync(file, JSON.stringify({privateKey: {kty: 'RSA', d: secret, n: secret}}))
  const output = execFileSync(process.execPath, [new URL('./inspect-auth-key-shape.mjs', import.meta.url).pathname, file], {encoding: 'utf8'})
  assert.match(output, /privateKey/)
  assert.match(output, /"d"/)
  assert.doesNotMatch(output, new RegExp(secret))
  console.log('Auth key shape inspection reports names without values')
} finally {
  rmSync(dir, {recursive: true, force: true})
}

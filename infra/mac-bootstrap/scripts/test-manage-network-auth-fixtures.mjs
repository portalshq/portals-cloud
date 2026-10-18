import assert from 'node:assert/strict'
import {mkdtempSync, readFileSync, writeFileSync, lstatSync, existsSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {manageNetworkAuthFixtures} from './manage-network-auth-fixtures.mjs'

const root = mkdtempSync(join(tmpdir(), 'network-auth-fixture-test-'))
const adminFile = join(root, 'auth.env')
writeFileSync(adminFile, `INTERNAL_ADMIN_TOKEN=${'a'.repeat(40)}\n`, {mode: 0o600})
const issued = new Map(), revoked = []
function response(status, body) { return {ok: status >= 200 && status < 300, status, json: async () => body} }
async function fakeFetch(url, options) {
  assert.equal(url.hostname, '127.0.0.1')
  assert.equal(options.headers.authorization, `Bearer ${'a'.repeat(40)}`)
  if (url.pathname === '/v1/api-keys') {
    const body = JSON.parse(options.body)
    const id = randomUUID()
    issued.set(body.service_account_id, id)
    return response(200, {api_key: `lore_sk_${id}.test-secret`})
  }
  const match = url.pathname.match(/^\/v1\/service-accounts\/(.+)\/revoke$/)
  assert.ok(match, 'Unexpected mock Auth endpoint')
  revoked.push(decodeURIComponent(match[1]))
  return response(204)
}
try {
  const dir = join(root, 'normal')
  const created = await manageNetworkAuthFixtures({
    action: 'create', directory: dir, authEnvFile: adminFile, fetchImpl: fakeFetch,
  })
  assert.equal(created.state, 'active')
  assert.equal(created.subjects.length, 2)
  assert.equal(lstatSync(dir).mode & 0o077, 0)
  assert.equal(lstatSync(join(dir, 'keys.json')).mode & 0o077, 0)
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  assert.equal(manifest.identities.length, 2)
  assert.ok(!readFileSync(join(dir, 'manifest.json'), 'utf8').includes('test-secret'))
  const keys = JSON.parse(readFileSync(join(dir, 'keys.json'), 'utf8'))
  assert.deepEqual(Object.keys(keys).sort(), ['PORTALS_TEST_OWNER_A_KEY', 'PORTALS_TEST_OWNER_B_KEY'])
  await assert.rejects(manageNetworkAuthFixtures({
    action: 'create', directory: dir, authEnvFile: adminFile, fetchImpl: fakeFetch,
  }), /already exists/)
  const done = await manageNetworkAuthFixtures({
    action: 'revoke', directory: dir, authEnvFile: adminFile, fetchImpl: fakeFetch,
  })
  assert.equal(done.state, 'revoked')
  assert.deepEqual(revoked.sort(), created.subjects.sort())
  assert.ok(!existsSync(join(dir, 'keys.json')))
  assert.equal(JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')).state, 'revoked')

  const partial = join(root, 'partial')
  let issueCount = 0
  const partialFetch = async (url, options) => {
    if (url.pathname === '/v1/api-keys' && ++issueCount === 2) return response(500)
    return fakeFetch(url, options)
  }
  const before = revoked.length
  await assert.rejects(manageNetworkAuthFixtures({
    action: 'create', directory: partial, authEnvFile: adminFile, fetchImpl: partialFetch,
  }), /isolated subjects were revoked/)
  assert.ok(!existsSync(partial))
  assert.equal(revoked.length - before, 2)

  await assert.rejects(manageNetworkAuthFixtures({
    action: 'create', directory: join(root, 'unsafe'), authEnvFile: adminFile,
    internalBaseUrl: 'https://auth.portals.works/', fetchImpl: fakeFetch,
  }), /host-local internal API/)
  assert.ok(!existsSync(join(root, 'unsafe')))
  console.log('Network Auth fixture lifecycle: private files, isolated IDs, cleanup, no-overwrite and loopback gate passed (mock API only)')
} finally {
  rmSync(root, {recursive: true, force: true})
}

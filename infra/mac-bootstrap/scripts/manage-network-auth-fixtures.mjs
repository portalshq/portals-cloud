// Create and revoke two isolated Auth service-account credentials for the
// Lore/PX network suite. Run only on the Auth host: port 8086 stays private.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {resolve, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const keyPattern = /^lore_sk_([0-9a-f-]{36})\.[A-Za-z0-9_-]+$/i
function privateFile(path) {
  const info = lstatSync(path)
  assert.ok(info.isFile() && !info.isSymbolicLink() && (info.mode & 0o077) === 0,
    'Private fixture/auth file must be a regular file with mode 0600 or stricter')
  return readFileSync(path, 'utf8')
}
function adminToken(path) {
  const value = privateFile(path).match(/^INTERNAL_ADMIN_TOKEN=(.+)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2')
  assert.ok(value && value.length >= 32 && !value.includes('__REPLACE_'), 'Auth internal admin credential is unavailable')
  return value
}
function fixturePath(dir, name) { return join(resolve(dir), name) }
function validateBase(url) {
  const parsed = new URL(url)
  assert.ok(parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname),
    'Auth fixture management requires the host-local internal API')
  assert.ok(!parsed.username && !parsed.password && !parsed.search && !parsed.hash && parsed.pathname === '/',
    'Internal API base URL must not contain credentials or a path')
  return parsed
}
export async function manageNetworkAuthFixtures({
  action, directory, authEnvFile = '/Users/portals-svc/secrets/auth.env',
  internalBaseUrl = 'http://127.0.0.1:8086/', fetchImpl = fetch,
}) {
  assert.ok(['create', 'revoke'].includes(action), 'Action must be create or revoke')
  assert.ok(directory && resolve(directory) === directory, 'Fixture directory must be absolute')
  const base = validateBase(internalBaseUrl)
  const token = adminToken(authEnvFile)
  async function internal(path, method, body) {
    const response = await fetchImpl(new URL(path, base), {
      method,
      headers: {authorization: `Bearer ${token}`, 'content-type': 'application/json'},
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error(`Auth internal fixture operation failed: ${method} ${response.status}`)
    return response.status === 204 ? null : response.json()
  }
  const manifestPath = fixturePath(directory, 'manifest.json')
  const keysPath = fixturePath(directory, 'keys.json')
  if (action === 'create') {
    assert.ok(!existsSync(directory), 'Fixture directory already exists; refusing to overwrite')
    mkdirSync(directory, {recursive: false, mode: 0o700})
    const info = lstatSync(directory)
    assert.ok(info.isDirectory() && !info.isSymbolicLink() && (info.mode & 0o077) === 0,
      'Fixture directory must be private')
    const runId = randomUUID()
    const identities = ['a', 'b'].map(name => ({
      name: `owner-${name}`,
      subject: `readiness-${runId}-${name}`,
      apiKeyEnv: `PORTALS_TEST_OWNER_${name.toUpperCase()}_KEY`,
    }))
    const keys = {}
    const issued = []
    try {
      for (const identity of identities) {
        const result = await internal('/v1/api-keys', 'POST', {
          service_account_id: identity.subject,
          display_name: `Network acceptance ${runId} ${identity.name}`,
          lifetime_days: 1,
        })
        const match = keyPattern.exec(result?.api_key || '')
        assert.ok(match, 'Auth returned an invalid API-key format')
        identity.keyId = match[1]
        issued.push(identity)
        keys[identity.apiKeyEnv] = result.api_key
      }
      const manifest = {schemaVersion: 1, purpose: 'network-auth-acceptance',
        runId, state: 'active', createdAt: new Date().toISOString(), identities}
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', {mode: 0o600, flag: 'wx'})
      writeFileSync(keysPath, JSON.stringify(keys) + '\n', {mode: 0o600, flag: 'wx'})
      return {state: 'active', runId, directory, subjects: identities.map(x => x.subject)}
    } catch (error) {
      let cleanupFailed = false
      for (const identity of identities) {
        try { await internal(`/v1/service-accounts/${encodeURIComponent(identity.subject)}/revoke`, 'POST') }
        catch { cleanupFailed = true }
      }
      if (!cleanupFailed) rmSync(directory, {recursive: true, force: true})
      else {
        // Preserve a non-secret recovery record if the API could not confirm
        // revocation; never silently discard potentially live credentials.
        const recovery = {schemaVersion: 1, purpose: 'network-auth-acceptance',
          runId, state: 'cleanup-required', identities: identities.map(({name, subject, keyId}) => ({name, subject, keyId}))}
        writeFileSync(manifestPath, JSON.stringify(recovery, null, 2) + '\n', {mode: 0o600})
      }
      throw new Error(cleanupFailed
        ? 'Fixture creation failed; cleanup is unconfirmed. Inspect private manifest and revoke its subjects.'
        : 'Fixture creation failed; isolated subjects were revoked.')
    }
  }
  const dirInfo = lstatSync(directory)
  assert.ok(dirInfo.isDirectory() && !dirInfo.isSymbolicLink() && (dirInfo.mode & 0o077) === 0,
    'Fixture directory must be private')
  const manifest = JSON.parse(privateFile(manifestPath))
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.purpose, 'network-auth-acceptance')
  assert.ok(['active', 'cleanup-required'].includes(manifest.state), 'Fixture is not active')
  assert.ok(Array.isArray(manifest.identities) && manifest.identities.length === 2)
  let failed = false
  for (const identity of manifest.identities) {
    assert.match(identity.subject, /^readiness-[0-9a-f-]{36}-[ab]$/)
    try { await internal(`/v1/service-accounts/${encodeURIComponent(identity.subject)}/revoke`, 'POST') }
    catch { failed = true }
  }
  if (failed) throw new Error('Fixture revocation is unconfirmed; private keys and manifest were retained for retry')
  const revoked = {...manifest, state: 'revoked', revokedAt: new Date().toISOString()}
  writeFileSync(manifestPath, JSON.stringify(revoked, null, 2) + '\n', {mode: 0o600})
  if (existsSync(keysPath)) rmSync(keysPath)
  return {state: 'revoked', runId: manifest.runId, directory}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, directory] = process.argv.slice(2)
  assert.ok(process.argv.includes('--isolated-fixtures'), 'Pass --isolated-fixtures for live Auth writes')
  try {
    const result = await manageNetworkAuthFixtures({
      action, directory,
      authEnvFile: process.env.AUTH_TEST_ENV_FILE,
      internalBaseUrl: process.env.AUTH_TEST_INTERNAL_BASE_URL,
    })
    console.log(`NETWORK_AUTH_FIXTURES_${result.state.toUpperCase()} run_id=${result.runId} directory=${result.directory}`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

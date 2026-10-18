import assert from 'node:assert/strict'
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, lstatSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve, sep} from 'node:path'
import {spawnSync} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'
import {createHash} from 'node:crypto'

// Config contains endpoint/fixture references, never credentials. The supplied
// test identities must already own their own fixture repositories/manifests.
const [configPath, reportPath] = process.argv.slice(2)
assert.ok(configPath && reportPath, 'Usage: test-network-auth.mjs PROFILE.json NEW_REPORT.json')
const config = JSON.parse(readFileSync(configPath, 'utf8'))
let privateKeys = {}
if (process.env.PORTALS_NETWORK_AUTH_KEYS_FILE) {
  const keyFile = process.env.PORTALS_NETWORK_AUTH_KEYS_FILE
  const info = lstatSync(keyFile)
  assert.ok(info.isFile() && !info.isSymbolicLink() && (info.mode & 0o077) === 0,
    'Network Auth key file must be a regular private file (mode 0600 or stricter)')
  privateKeys = JSON.parse(readFileSync(keyFile, 'utf8'))
  assert.ok(privateKeys && typeof privateKeys === 'object' && !Array.isArray(privateKeys))
}
if (config.renewal) {
  assert.ok(Number.isInteger(config.renewal.accessTokenTtlSeconds) && config.renewal.accessTokenTtlSeconds >= 60 && config.renewal.accessTokenTtlSeconds <= 3600)
  assert.ok(Number.isInteger(config.renewal.cycles) && config.renewal.cycles >= 2 && config.renewal.cycles <= 3)
}
assert.equal(config.schemaVersion, 1)
if (config.quic?.required) {
  assert.match(config.quic.expectedStorageUrl || '', /^quics:\/\/[A-Za-z0-9.-]+:\d+$/, 'QUIC acceptance requires the exact certificate-verified storage URL advertised by Lore')
  assert.ok(config.quic.grpcurlBin && config.quic.environmentProtoRoot && config.quic.environmentTarget,
    'QUIC acceptance requires a TLS grpcurl EnvironmentGet probe configuration')
  assert.ok(Array.isArray(config.identities), 'QUIC acceptance requires an identity profile')
  for (const identity of config.identities) {
    assert.ok(Array.isArray(identity.expectedQuicFiles) && identity.expectedQuicFiles.length > 0,
      `QUIC acceptance requires known content markers for ${identity.name}`)
    for (const file of identity.expectedQuicFiles) {
      assert.ok(typeof file.path === 'string' && file.path.length > 0 && !file.path.startsWith('/'))
      assert.match(file.sha256, /^[a-f0-9]{64}$/)
    }
  }
}
assert.ok(Array.isArray(config.identities) && config.identities.length >= 2, 'At least two test identities are required')
assert.ok(config.pxBinary && config.loreBinary && config.expectedPxVersion && config.expectedLoreVersion)
assert.match(config.remoteUrl, /^(grpcs|lores):\/\//, 'Use a certificate-verified network URL')
assert.ok(!config.remoteUrl.includes('__REPLACE_'))
const names = new Set(), subjects = new Set()
for (const identity of config.identities) {
  assert.match(identity.name, /^[a-zA-Z0-9_-]+$/)
  assert.ok(!names.has(identity.name)); names.add(identity.name)
  assert.ok(identity.expectedSubject && !subjects.has(identity.expectedSubject)); subjects.add(identity.expectedSubject)
  assert.ok(['api-key', 'browser'].includes(identity.loginMode || 'api-key'))
  if (identity.loginMode !== 'browser') assert.match(identity.apiKeyEnv, /^[A-Z][A-Z0-9_]*$/)
  assert.ok(identity.allowedRepository && identity.deniedRepository && identity.allowedPxUri && identity.deniedPxUri)
  assert.notEqual(identity.allowedRepository, identity.deniedRepository)
}
// A failing cross-repo lookup is meaningful only if another test identity
// successfully owns/reads that exact fixture in the same suite run.
for (const identity of config.identities) {
  assert.ok(config.identities.some(other => other.name !== identity.name && other.allowedRepository === identity.deniedRepository && other.allowedPxUri === identity.deniedPxUri), 'Every denied fixture must be another configured identity\'s allowed fixture')
}
const results = []
const temp = mkdtempSync(join(tmpdir(), 'portals-network-auth-'))
const failures = /unauthenticated|permission.?denied|not.?authori[sz]ed|access.?denied|forbidden|not found|notfound/i
function invoke(binary, args, env, input) {
  return spawnSync(binary, args, {env, input, encoding: 'utf8', timeout: 30000, maxBuffer: 1024*1024})
}
function record(identity, check, status, reason) {
  results.push({identity, check, status, ...(reason ? {reason} : {})})
  console.log(`${status.toUpperCase()} ${identity}/${check}`)
}
function accessSnapshot(run, subject) {
  const result = run(config.loreBinary, ['auth', 'list', '--with-token', '--json'])
  assert.equal(result.status, 0, 'Cannot inspect cached access-token metadata')
  try {
    const matches = result.stdout.split('\n').filter(x => x.trim()).map(x => JSON.parse(x))
      .filter(x => x.tagName === 'authIdentity' && !x.data.resource && x.data.userId === subject)
    if (matches.length !== 1) throw new Error()
    const token = matches[0].data.token
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    if (claims.sub !== subject || !Number.isInteger(claims.exp) || !Number.isInteger(claims.iat) || claims.exp - claims.iat !== config.renewal.accessTokenTtlSeconds) throw new Error()
    return {expires: claims.exp, fingerprint: createHash('sha256').update(token).digest('hex')}
  } catch { throw new Error('Cached access-token subject or actual issued TTL does not match the renewal profile') }
}
function verifyQuicClone(loreBinary, run, identity, destination) {
  const clone = run(loreBinary, ['clone', '--non-interactive', identity.allowedRepository, destination])
  if (clone.status !== 0 || clone.error) {
    record(identity.name, 'lore_quic_storage_clone', 'failed', 'Authenticated Lore clone did not complete')
    throw new Error('Authenticated Lore clone did not complete over the configured storage endpoint')
  }
  for (const expected of identity.expectedQuicFiles) {
    const root = resolve(destination)
    const filePath = resolve(root, expected.path)
    if (!filePath.startsWith(`${root}${sep}`)) throw new Error('QUIC fixture content path escapes its temporary clone')
    let info
    try { info = lstatSync(filePath) } catch { throw new Error('QUIC clone omitted a configured content marker') }
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('QUIC content marker is not a regular file')
    const digest = createHash('sha256').update(readFileSync(filePath)).digest('hex')
    if (digest !== expected.sha256) throw new Error('QUIC content marker checksum did not match the fixture')
  }
  record(identity.name, 'lore_quic_storage_clone', 'passed')
}
let versionsOk = true
const versionEnv = {...process.env}
for (const configured of config.identities) if (configured.apiKeyEnv) delete versionEnv[configured.apiKeyEnv]
delete versionEnv.PORTALS_SUITE_API_KEY
delete versionEnv.PORTALS_CLOUD_API_KEY
delete versionEnv.PORTALS_NETWORK_AUTH_KEYS_FILE
for (const [name, binary, expected] of [['px', config.pxBinary, config.expectedPxVersion], ['lore', config.loreBinary, config.expectedLoreVersion]]) {
  const p = invoke(binary, ['--version'], versionEnv)
  const ok = p.status === 0 && p.stdout.trim().split(/\s+/)[1]?.split('+')[0] === expected
  record('suite', `${name}_version`, ok ? 'passed' : 'failed', ok ? undefined : 'Binary missing or version differs from profile')
  versionsOk &&= ok
}
const ready = []
let quicEndpointReady = true
if (config.quic?.required) {
  const protoRoot = resolve(config.quic.environmentProtoRoot)
  const protoFile = join(protoRoot, 'environment-v1.proto')
  const probe = invoke(config.quic.grpcurlBin, [
    '-import-path', protoRoot, '-proto', 'environment-v1.proto', '-d', '{}',
    config.quic.environmentTarget,
    'lore.environment.v1.EnvironmentService/EnvironmentGet',
  ], versionEnv)
  try {
    assert.equal(probe.status, 0, 'Lore EnvironmentGet failed before QUIC test')
    const payload = JSON.parse(probe.stdout)
    assert.equal(payload?.environment?.endpoint?.storageUrl, config.quic.expectedStorageUrl,
      'Lore does not advertise the exact certificate-verified QUIC endpoint under test')
    assert.ok(readFileSync(protoFile, 'utf8').includes('service EnvironmentService'), 'EnvironmentGet proto is invalid')
    record('suite', 'quic_storage_endpoint_advertisement', 'passed')
  } catch {
    quicEndpointReady = false
    record('suite', 'quic_storage_endpoint_advertisement', 'failed', 'EnvironmentGet did not advertise the expected QUIC TLS hostname and UDP port')
  }
}
try {
  for (const identity of config.identities) {
    const secret = privateKeys[identity.apiKeyEnv] ?? process.env[identity.apiKeyEnv]
    if (!versionsOk || !quicEndpointReady || (identity.loginMode !== 'browser' && !secret)) {
      record(identity.name, 'identity_setup', 'blocked', !versionsOk ? 'Version gate failed' : !quicEndpointReady ? 'QUIC endpoint advertisement gate failed' : 'Required private API-key environment variable is missing')
      continue
    }
    const base = join(temp, identity.name), auth = join(base, 'auth')
    mkdirSync(auth, {recursive: true, mode: 0o700})
    writeFileSync(join(base, 'provider.toml'), `provider_type = "remote"\nremote_url = ${JSON.stringify(config.remoteUrl)}\nworkspace_id = ${JSON.stringify(identity.workspaceId || identity.name)}\n`, {mode: 0o600})
    const env = {...process.env, PXLORE_CLI: resolve(config.loreBinary), PX_DIR: base, LORE_AUTH_PATH: auth, NO_COLOR: '1'}
    for (const configured of config.identities) delete env[configured.apiKeyEnv]
    delete env.PORTALS_SUITE_API_KEY
    delete env.PORTALS_CLOUD_API_KEY
    delete env.PORTALS_NETWORK_AUTH_KEYS_FILE
    // Keep the CLI's normal secure credential backend. Never enable its
    // development fallback just to make production acceptance pass.
    delete env.LORE_AUTH_STORE
    env.LORE_SECURITY_MODE = 'strict'
    const run = (binary, args, input, extra = {}) => invoke(binary, args, {...env, ...extra}, input)
    const px = (args, extra) => run(config.pxBinary, ['--base-dir', base, ...args], undefined, extra)
    let live = false
    try {
      const bad = run(config.loreBinary, ['auth', 'login', '--token-type', 'api-key', '--token-stdin', config.remoteUrl], 'invalid-readiness-key')
      const badOk = bad.status !== 0 && !bad.error && failures.test(bad.stdout + bad.stderr)
      record(identity.name, 'invalid_key_denied', badOk ? 'passed' : 'failed', badOk ? undefined : 'Expected explicit authentication denial; connection errors do not count')
      const browserLogin = (binary, args) => spawnSync(binary, args, {env, stdio: 'inherit', timeout: 300000})
      const direct = identity.loginMode === 'browser'
        ? browserLogin(config.loreBinary, ['auth', 'login', config.remoteUrl])
        : run(config.loreBinary, ['auth', 'login', '--token-type', 'api-key', '--token-stdin', config.remoteUrl], secret)
      assert.equal(direct.status, 0, 'Lore API-key login failed')
      const directStatus = run(config.loreBinary, ['auth', 'list'])
      assert.ok(directStatus.status === 0 && directStatus.stdout.includes(identity.expectedSubject), 'Lore identity does not match configured subject')
      record(identity.name, 'lore_login_identity', 'passed')
      assert.equal(run(config.loreBinary, ['auth', 'logout', '--remote-url', config.remoteUrl]).status, 0, 'Lore logout failed')
      const login = identity.loginMode === 'browser'
        ? browserLogin(config.pxBinary, ['--base-dir', base, 'auth', 'login'])
        : px(['auth', 'login', '--api-key', '--api-key-env', 'PORTALS_SUITE_API_KEY'], {PORTALS_SUITE_API_KEY: secret})
      assert.equal(login.status, 0, 'PX login failed')
      const status = px(['auth', 'status'])
      assert.ok(status.status === 0 && status.stdout.includes(identity.expectedSubject), 'PX identity does not match configured subject')
      record(identity.name, 'px_login_identity', 'passed')
      assert.equal(run(config.loreBinary, ['repository', 'info', identity.allowedRepository]).status, 0, 'Own Lore repository read failed')
      assert.equal(px(['resolve', identity.allowedPxUri]).status, 0, 'Own PX manifest read failed')
      record(identity.name, 'own_repository_and_px_read', 'passed')
      if (config.quic?.required) {
        const clonePath = join(temp, identity.name, 'quic-storage-clone')
        verifyQuicClone(config.loreBinary, run, identity, clonePath)
      }
      const snapshot = config.renewal ? accessSnapshot(run, identity.expectedSubject) : undefined
      ready.push({identity, run, px, snapshot})
      live = true
    } catch (error) {
      record(identity.name, 'identity_flow', 'failed', error.message.split('\n')[0])
    } finally {
      if (!live) px(['auth', 'logout'])
    }
  }
  if (config.renewal && ready.length > 0) {
    for (let cycle = 1; cycle <= config.renewal.cycles; cycle++) {
      console.log(`Waiting for access-token expiry before renewal cycle ${cycle}`)
      await delay((config.renewal.accessTokenTtlSeconds + 2)*1000)
      for (const fixture of ready) {
        const {identity, run, px, snapshot} = fixture
        try {
          assert.ok(Date.now()/1000 > snapshot.expires, 'Previous access token has not expired')
          assert.equal(run(config.loreBinary, ['repository', 'info', identity.allowedRepository]).status, 0, 'Lore renewal read failed')
          assert.equal(px(['resolve', identity.allowedPxUri]).status, 0, 'PX renewal read failed')
          const status = px(['auth', 'status'])
          assert.ok(status.status === 0 && status.stdout.includes(identity.expectedSubject), 'Renewal changed identity')
          const renewed = accessSnapshot(run, identity.expectedSubject)
          assert.ok(renewed.expires > snapshot.expires && renewed.fingerprint !== snapshot.fingerprint, 'Access token did not actually renew')
          fixture.snapshot = renewed
          for (const p of [run(config.loreBinary, ['repository', 'info', identity.deniedRepository]), px(['resolve', identity.deniedPxUri])]) {
            assert.ok(p.status !== 0 && !p.error && failures.test(p.stdout + p.stderr), 'Cross-repository denial failed after renewal')
          }
          record(identity.name, `renewal_cycle_${cycle}`, 'passed')
        } catch { record(identity.name, `renewal_cycle_${cycle}`, 'failed', 'Authenticated access, expected identity, or denial failed after expiry') }
      }
    }
  }
  for (const {identity, run, px} of ready) {
    try {
      const ownerReady = ready.some(other => other.identity.allowedRepository === identity.deniedRepository && other.identity.allowedPxUri === identity.deniedPxUri)
      if (!ownerReady) { record(identity.name, 'cross_repository_denial', 'blocked', 'Other fixture owner did not pass its positive reads'); continue }
      for (const [label, p] of [
        ['lore_cross_repository_denial', run(config.loreBinary, ['repository', 'info', identity.deniedRepository])],
        ['px_cross_repository_denial', px(['resolve', identity.deniedPxUri])],
      ]) {
        const ok = p.status !== 0 && !p.error && failures.test(p.stdout + p.stderr)
        record(identity.name, label, ok ? 'passed' : 'failed', ok ? undefined : 'Expected explicit denial for an existing fixture; transport failure does not count')
      }
      if (config.quic?.required) {
        const deniedClone = run(config.loreBinary, ['clone', '--non-interactive', identity.deniedRepository, join(temp, identity.name, 'denied-quic-clone')])
        const denied = deniedClone.status !== 0 && !deniedClone.error && failures.test(deniedClone.stdout + deniedClone.stderr)
        record(identity.name, 'lore_quic_path_cross_repository_denial', denied ? 'passed' : 'failed', denied ? undefined : 'Expected explicit denial while attempting to clone the other identity\'s existing repository')
      }
    } finally {
      const logout = px(['auth', 'logout']), status = px(['auth', 'status'])
      const ok = logout.status === 0 && status.status === 0 && !status.stdout?.includes(identity.expectedSubject)
      record(identity.name, 'logout_cache_cleared', ok ? 'passed' : 'failed')
    }
  }
} finally {
  rmSync(temp, {recursive: true, force: true})
  const passed = results.every(r => r.status === 'passed')
  const capabilities = ['Lore/PX login and repository isolation']
  if (config.renewal) capabilities.push('actual access-token renewal')
  if (config.quic?.required) capabilities.push('authenticated QUIC storage clone and content verification')
  writeFileSync(reportPath, JSON.stringify({schemaVersion: 1, timestamp: new Date().toISOString(), profile: config.name, scope: capabilities.join(', '), passed, results}, null, 2) + '\n', {mode: 0o600, flag: 'wx'})
  if (!passed) process.exitCode = 1
}

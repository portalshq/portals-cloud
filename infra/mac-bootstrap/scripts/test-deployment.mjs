import assert from 'node:assert/strict'
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
import {randomBytes} from 'node:crypto'

const root = resolve(import.meta.dirname, '..')
const temp = mkdtempSync(join(tmpdir(), 'portals-deployment-'))
try {
  const runtime = join(temp, 'runtime with spaces')
  mkdirSync(join(runtime, 'scripts'), {recursive: true})
  mkdirSync(join(runtime, 'templates'))
  const fixture = (file, contents) => { writeFileSync(file, contents); chmodSync(file, 0o700) }
  fixture(join(runtime, 'scripts/deploy.sh'), readFileSync(join(root, 'scripts/deploy.sh')))
  fixture(join(runtime, 'scripts/bootstrap.sh'), '#!/bin/sh\nexit 0\n')
  const envFile = join(temp, 'release with spaces.env')
  writeFileSync(envFile, 'AUTH_DOMAIN=auth.example.test\n')
  fixture(join(temp, 'docker'), '#!/bin/sh\n[ "$1" = compose ] && [ "$2" = --env-file ] && [ "$3" = "$MAC_RELEASE_ENV" ] && [ "$4" = -f ] && [ "$6" = up ] || exit 99\nprintf "%s\\n" "$8" >> "$TEST_LOG"\n')
  fixture(join(temp, 'curl'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$TEST_CURL_LOG"\n')
  const log = join(temp, 'services.log')
  const curlLog = join(temp, 'curl.log')
  const result = spawnSync('sh', [join(runtime, 'scripts/deploy.sh')], {env: {...process.env, PATH: `${temp}:${process.env.PATH}`, MAC_RELEASE_ENV: envFile, TEST_LOG: log, TEST_CURL_LOG: curlLog}, encoding: 'utf8'})
  assert.equal(result.status, 0, result.stderr)
  assert.equal(readFileSync(log, 'utf8'), 'auth-gateway\ncaddy\nlore\n')
  const probes = readFileSync(curlLog, 'utf8')
  assert.match(probes, /https:\/\/auth\.example\.test:8443\/\.well-known\/jwks\.json/)
  assert.match(probes, /41339\/health_check/)
  assert.doesNotMatch(probes, /41339\/health(?:\s|$)/)
  const inputs = ['AUTH_GATEWAY_IMAGE_DIGEST', 'LORE_IMAGE_DIGEST', 'CADDY_IMAGE_DIGEST', 'AUTH_ENV_FILE', 'AUTH_SECRET_DIR', 'LORE_ENV_FILE', 'LORE_AWS_ENV_FILE', 'CADDY_ENV_FILE', 'CADDY_CERT_DIR', 'LORE_QUIC_CERT_DIR', 'AUTH_DOMAIN', 'LORE_DOMAIN']
  const rejected = spawnSync(process.execPath, [join(root, 'scripts/check-release.mjs')], {env: {...process.env, ...Object.fromEntries(inputs.map(name => [name, '__REPLACE_VALUE__']))}, encoding: 'utf8'})
  assert.notEqual(rejected.status, 0)
  assert.match(rejected.stderr, /deployment placeholder/)
  // Check the real promoted BOM with isolated, non-secret configuration fixtures.
  mkdirSync(join(temp, 'lore'))
  for (const file of ['versions.yaml', 'verified-dockerhub-images.json']) {
    writeFileSync(join(temp, 'lore', file), readFileSync(join(root, '../lore', file)))
  }
  for (const file of ['compose.prod.yaml', 'Caddyfile']) {
    writeFileSync(join(runtime, 'templates', file), readFileSync(join(root, 'templates', file)))
  }
  const positive = {AUTH_DOMAIN: 'auth.portals.works', LORE_DOMAIN: 'lore.portals.works'}
  const pulumiProd = readFileSync(resolve(root, '../pulumi/Pulumi.prod.yaml'), 'utf8')
  assert.match(pulumiProd, /^  portals-platform:authHostname: auth\.portals\.works$/m)
  assert.match(pulumiProd, /^  portals-platform:loreHostname: lore\.portals\.works$/m)
  const images = readFileSync(join(root, 'templates/release.env.example'), 'utf8')
  for (const name of inputs.filter(name => name.endsWith('_IMAGE_DIGEST'))) positive[name] = images.match(new RegExp(`^${name}=(.+)$`, 'm'))[1]
  for (const name of ['AUTH_SECRET_DIR', 'CADDY_CERT_DIR', 'LORE_QUIC_CERT_DIR']) {
    positive[name] = join(temp, name)
    mkdirSync(positive[name])
    for (const file of name === 'AUTH_SECRET_DIR' ? ['signing-key', 'api-key-pepper'] : ['fullchain.pem', 'privkey.pem']) writeFileSync(join(positive[name], file), 'test-only fixture')
  }
  for (const [name, template] of [['AUTH_ENV_FILE', 'auth.env.example'], ['LORE_ENV_FILE', 'lore.env.example'], ['LORE_AWS_ENV_FILE', 'lore-aws.env.example'], ['CADDY_ENV_FILE', 'caddy.env.example']]) {
    positive[name] = join(temp, name)
    const contents = readFileSync(join(root, 'templates', template), 'utf8')
      .replace(/__REPLACE_[A-Z0-9_]+__/g, 'fixture-value-with-at-least-32-bytes')
    writeFileSync(positive[name], contents)
  }
  const check = () => spawnSync(process.execPath, [join(root, 'scripts/check-release.mjs')], {cwd: runtime, env: {...process.env, ...positive}, encoding: 'utf8'})
  const accepted = check()
  assert.equal(accepted.status, 0, accepted.stderr)
  const validLoreAwsEnv = readFileSync(positive.LORE_AWS_ENV_FILE, 'utf8')
  writeFileSync(positive.LORE_AWS_ENV_FILE, `${validLoreAwsEnv}\nAWS_REGION=us-east-1\n`)
  assert.match(check().stderr, /unexpected AWS_REGION/)
  writeFileSync(positive.LORE_AWS_ENV_FILE, validLoreAwsEnv)
  const validLoreEnv = readFileSync(positive.LORE_ENV_FILE, 'utf8')
  writeFileSync(positive.LORE_ENV_FILE, `${validLoreEnv}\nAWS_ACCESS_KEY_ID=duplicate-from-config\n`)
  assert.match(check().stderr, /both define AWS_ACCESS_KEY_ID/)
  writeFileSync(positive.LORE_ENV_FILE, validLoreEnv)
  writeFileSync(positive.LORE_AWS_ENV_FILE, validLoreAwsEnv.replace('AWS_SECRET_ACCESS_KEY=', 'AWS_SECRET_ACCESS_KEY=__REPLACE_SECRET__'))
  assert.match(check().stderr, /placeholder/)
  writeFileSync(positive.LORE_AWS_ENV_FILE, validLoreAwsEnv)
  const validDigest = positive.AUTH_GATEWAY_IMAGE_DIGEST
  positive.AUTH_GATEWAY_IMAGE_DIGEST = `portalshq/auth-gateway@sha256:${'0'.repeat(64)}`
  assert.match(check().stderr, /must match the Docker Hub control-plane.image/)
  positive.AUTH_GATEWAY_IMAGE_DIGEST = validDigest
  fixture(join(temp, 'nc'), '#!/bin/sh\nexit 0\n')
  fixture(join(temp, 'pinggy'), '#!/bin/sh\nexec sleep 30\n')
  const knownHosts = join(temp, 'known_hosts')
  writeFileSync(knownHosts, 'test-host-key\n', {mode: 0o600})
  const pinnedHostKeyOptions = `-o StrictHostKeyChecking=yes -o UserKnownHostsFile=${knownHosts}`
  writeFileSync(envFile, `PINGGY_TCP_COMMAND='pinggy ${pinnedHostKeyOptions}'\nPINGGY_UDP_COMMAND='false ${pinnedHostKeyOptions}'\nPINGGY_KNOWN_HOSTS_FILE=${knownHosts}\n`)
  const tunnelEnv = {env: {...process.env, PATH: `${temp}:${process.env.PATH}`, MAC_RELEASE_ENV: envFile, TEST_CURL_LOG: curlLog}, encoding: 'utf8'}
  writeFileSync(envFile, `PINGGY_TCP_COMMAND=''\nPINGGY_UDP_COMMAND='false ${pinnedHostKeyOptions}'\nPINGGY_KNOWN_HOSTS_FILE=${knownHosts}\n`)
  const unsafeTunnel = spawnSync('sh', [join(root, 'scripts/run-pinggy.sh')], {...tunnelEnv, timeout: 6000})
  assert.notEqual(unsafeTunnel.status, 0)
  assert.match(unsafeTunnel.stderr, /PINGGY_TCP_COMMAND is required/)
  writeFileSync(envFile, `PINGGY_TCP_COMMAND='pinggy -o StrictHostKeyChecking=no ${pinnedHostKeyOptions}'\nPINGGY_UDP_COMMAND='false ${pinnedHostKeyOptions}'\nPINGGY_KNOWN_HOSTS_FILE=${knownHosts}\n`)
  const hostKeyRejected = spawnSync('sh', [join(root, 'scripts/run-pinggy.sh')], {...tunnelEnv, timeout: 6000})
  assert.notEqual(hostKeyRejected.status, 0)
  assert.match(hostKeyRejected.stderr, /disables SSH host-key verification/)
  writeFileSync(envFile, `PINGGY_TCP_COMMAND='pinggy ${pinnedHostKeyOptions}'\nPINGGY_UDP_COMMAND='false ${pinnedHostKeyOptions}'\nPINGGY_KNOWN_HOSTS_FILE=${knownHosts}\n`)
  const tunnel = spawnSync('sh', [join(root, 'scripts/run-pinggy.sh')], {...tunnelEnv, timeout: 6000})
  assert.equal(tunnel.status, 1, `Tunnel supervisor must exit when either mapping dies: ${tunnel.stderr}`)
  assert.match(tunnel.stderr, /restarting both mappings/)
  const backupSource = join(temp, 'backup source')
  mkdirSync(backupSource)
  writeFileSync(join(backupSource, 'manifest.json'), '{"architecture":"mac-amd64"}')
  writeFileSync(join(backupSource, 'auth.env'), 'DO_NOT_BACK_UP=secret-fixture')
  const key = join(temp, 'backup-key')
  writeFileSync(key, randomBytes(32), {mode: 0o600})
  const bundle = join(temp, 'recovery.bundle')
  const backupEnv = {...process.env, BACKUP_SOURCE_DIR: backupSource, BACKUP_DESTINATION: bundle, BACKUP_KEY_FILE: key}
  const backup = spawnSync('sh', [join(root, 'scripts/backup.sh')], {env: backupEnv, encoding: 'utf8'})
  assert.equal(backup.status, 0, backup.stderr)
  const restored = join(temp, 'restored.tar.gz')
  const decrypt = spawnSync(process.execPath, [join(root, 'scripts/backup-crypto.mjs'), 'decrypt', bundle, restored, key], {encoding: 'utf8'})
  assert.equal(decrypt.status, 0, decrypt.stderr)
  const archive = spawnSync('tar', ['-tzf', restored], {encoding: 'utf8'})
  assert.equal(archive.status, 0, archive.stderr)
  assert.match(archive.stdout, /manifest.json/)
  assert.doesNotMatch(archive.stdout, /auth.env/)
  assert.notEqual(spawnSync('sh', [join(root, 'scripts/backup.sh')], {env: backupEnv, encoding: 'utf8'}).status, 0)
  console.log('Deployment order, spaced paths, correct health endpoint, placeholder rejection, and paired tunnel restart passed')
  console.log('Encrypted manifest backup/restore, secret exclusion, and overwrite rejection passed')
} finally { rmSync(temp, {recursive: true, force: true}) }

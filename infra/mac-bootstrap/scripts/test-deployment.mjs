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
  const inputs = ['AUTH_GATEWAY_IMAGE_DIGEST', 'LORE_IMAGE_DIGEST', 'CADDY_IMAGE_DIGEST', 'AUTH_ENV_FILE', 'AUTH_SECRET_DIR', 'LORE_ENV_FILE', 'CADDY_ENV_FILE', 'CADDY_CERT_DIR', 'LORE_QUIC_CERT_DIR', 'AUTH_DOMAIN', 'LORE_DOMAIN']
  const rejected = spawnSync(process.execPath, [join(root, 'scripts/check-release.mjs')], {env: {...process.env, ...Object.fromEntries(inputs.map(name => [name, '__REPLACE_VALUE__']))}, encoding: 'utf8'})
  assert.notEqual(rejected.status, 0)
  assert.match(rejected.stderr, /deployment placeholder/)
  fixture(join(temp, 'nc'), '#!/bin/sh\nexit 0\n')
  writeFileSync(envFile, "PINGGY_TCP_COMMAND='sleep 30'\nPINGGY_UDP_COMMAND='false'\n")
  const tunnel = spawnSync('sh', [join(root, 'scripts/run-pinggy.sh')], {env: {...process.env, PATH: `${temp}:${process.env.PATH}`, MAC_RELEASE_ENV: envFile, TEST_CURL_LOG: curlLog}, encoding: 'utf8', timeout: 6000})
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

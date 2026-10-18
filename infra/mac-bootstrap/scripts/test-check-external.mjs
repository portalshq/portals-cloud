import assert from 'node:assert/strict'
import {chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'

const root = new URL('..', import.meta.url).pathname
const temp = mkdtempSync(join(tmpdir(), 'portals-check-external-'))
const bin = join(temp, 'bin')
mkdirSync(bin)

try {
  const curl = join(bin, 'curl')
  writeFileSync(curl, `#!${process.execPath}
const url = process.argv.find(value => value.startsWith('https://')) || ''
if (process.env.FAKE_CURL_FAIL_HOST && url.includes(process.env.FAKE_CURL_FAIL_HOST)) {
  console.error('simulated TLS verification failure')
  process.exit(60)
}
`)
  chmodSync(curl, 0o755)
  for (const name of ['grpcurl', 'nc']) {
    const path = join(bin, name)
    writeFileSync(path, '#!/bin/sh\nexit 0\n')
    chmodSync(path, 0o755)
  }

  const baseEnv = {
    ...process.env,
    PATH: `${bin}:/bin`,
    AUTH_DOMAIN: 'auth.example.test',
    LORE_DOMAIN: 'lore.example.test',
    LORE_QUIC_HOST: 'lore-quic.example.test',
    LORE_QUIC_PORT: '44444',
    AUTH_GRPC_PROBE_COMMAND: 'echo AUTH_GRPC_PROBE_OK',
    LORE_GRPC_PROBE_COMMAND: 'echo LORE_GRPC_PROBE_OK',
    LORE_QUIC_PROBE_COMMAND: 'echo LORE_QUIC_PROBE_OK',
    TENANT_DENIAL_PROBE_COMMAND: 'echo TENANT_DENIAL_PROBE_OK',
  }
  const run = extra => spawnSync('/bin/sh', [join(root, 'scripts/check-external.sh')], {
    cwd: root,
    env: {...baseEnv, ...extra},
    encoding: 'utf8',
    timeout: 10_000,
  })

  const success = run({})
  assert.equal(success.status, 0, `probe harness should work without macOS openssl: ${success.stderr}`)
  assert.match(success.stdout, /External TLS, authenticated gRPC, QUIC, and tenant-denial probes passed/)

  const badLoreCertificate = run({FAKE_CURL_FAIL_HOST: 'lore.example.test'})
  assert.notEqual(badLoreCertificate.status, 0, 'TLS verification failure must fail the external gate')
  assert.match(badLoreCertificate.stderr, /TLS verification failed for lore\.example\.test/)
  assert.doesNotMatch(badLoreCertificate.stdout, /External TLS, authenticated gRPC, QUIC, and tenant-denial probes passed/)

  console.log('External acceptance shell gate verifies TLS portably through curl and fails closed on Lore certificate errors')
} finally {
  rmSync(temp, {recursive: true, force: true})
}

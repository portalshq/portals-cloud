import assert from 'node:assert/strict'
import {chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'

const root = new URL('..', import.meta.url).pathname
const temporaryRoot = mkdtempSync(join(tmpdir(), 'portals-run-pinggy-'))
const bin = join(temporaryRoot, 'bin')
mkdirSync(bin)

try {
  const releaseEnv = join(temporaryRoot, 'release.env')
  const knownHosts = join(temporaryRoot, 'known_hosts')
  writeFileSync(knownHosts, 'pinggy test host key fixture\n')
  writeFileSync(releaseEnv, [
    `PINGGY_TCP_COMMAND='/usr/bin/ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${knownHosts} tcp@free.pinggy.io'`,
    "PINGGY_UDP_COMMAND='/Users/Shared/portals-tools/bin/pinggy --type udp'",
    `PINGGY_KNOWN_HOSTS_FILE=${knownHosts}`,
    '',
  ].join('\n'))

  const nc = join(bin, 'nc')
  writeFileSync(nc, '#!/bin/sh\nexit 0\n')
  chmodSync(nc, 0o755)

  const curl = join(bin, 'curl')
  writeFileSync(curl, '#!/bin/sh\nexit 0\n')
  chmodSync(curl, 0o755)

  const sh = join(bin, 'sh')
  writeFileSync(sh, `#!/bin/sh
case "$2" in
  'exec /usr/bin/ssh '*) printf 'TCP_MAPPING_STARTED\\n' ;;
  'exec /Users/Shared/portals-tools/bin/pinggy '*) printf 'UDP_MAPPING_STARTED\\n' ;;
  *) printf 'UNEXPECTED_MAPPING_COMMAND\\n' >&2; exit 91 ;;
esac
`)
  chmodSync(sh, 0o755)

  const run = (envFile, ...args) => spawnSync('/bin/sh', [join(root, 'scripts/run-pinggy.sh'), ...args], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${bin}:/usr/bin:/bin`,
      MAC_RELEASE_ENV: envFile,
    },
    encoding: 'utf8',
    timeout: 10_000,
  })

  const both = run(releaseEnv)
  assert.equal(both.status, 1, 'both mode should return failure when the test mappings exit')
  assert.match(both.stdout, /TCP_MAPPING_STARTED/)
  assert.match(both.stdout, /UDP_MAPPING_STARTED/)
  assert.match(both.stderr, /A Pinggy mapping exited/)

  const tcp = run(releaseEnv, 'tcp')
  assert.equal(tcp.status, 0, `tcp mode should start: ${tcp.stderr}`)
  assert.match(tcp.stdout, /TCP_MAPPING_STARTED/)
  assert.doesNotMatch(tcp.stdout, /UDP_MAPPING_STARTED/)

  const udp = run(releaseEnv, 'udp')
  assert.equal(udp.status, 0, `udp mode should start: ${udp.stderr}`)
  assert.match(udp.stdout, /UDP_MAPPING_STARTED/)
  assert.doesNotMatch(udp.stdout, /TCP_MAPPING_STARTED/)

  const invalid = run(releaseEnv, 'quic')
  assert.notEqual(invalid.status, 0, 'unknown mode must fail rather than starting a tunnel')
  assert.match(invalid.stderr, /Usage: run-pinggy\.sh \[tcp\|udp\]/)
  assert.doesNotMatch(invalid.stdout, /MAPPING_STARTED/)

  const tcpOnlyEnv = join(temporaryRoot, 'tcp-only.env')
  writeFileSync(tcpOnlyEnv, [
    `PINGGY_TCP_COMMAND='/usr/bin/ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${knownHosts} tcp@free.pinggy.io'`,
    `PINGGY_KNOWN_HOSTS_FILE=${knownHosts}`,
    '',
  ].join('\n'))
  const tcpOnly = run(tcpOnlyEnv, 'tcp')
  assert.equal(tcpOnly.status, 0, `tcp mode should not require UDP configuration: ${tcpOnly.stderr}`)
  assert.match(tcpOnly.stdout, /TCP_MAPPING_STARTED/)

  const udpOnlyEnv = join(temporaryRoot, 'udp-only.env')
  writeFileSync(udpOnlyEnv, "PINGGY_UDP_COMMAND='/Users/Shared/portals-tools/bin/pinggy --type udp'\n")
  const udpOnly = run(udpOnlyEnv, 'udp')
  assert.equal(udpOnly.status, 0, `udp mode should not require TCP configuration or Caddy: ${udpOnly.stderr}`)
  assert.match(udpOnly.stdout, /UDP_MAPPING_STARTED/)
  assert.doesNotMatch(udpOnly.stdout, /TCP_MAPPING_STARTED/)

  console.log('Pinggy runner selects tcp/udp explicitly, defaults to both, and validates only selected settings')
} finally {
  rmSync(temporaryRoot, {recursive: true, force: true})
}

import assert from 'node:assert/strict'
import {mkdtempSync, writeFileSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
const temp = mkdtempSync(join(tmpdir(), 'network-auth-runner-test-'))
try {
  const tool = `#!/usr/bin/env node
const fs=require('fs'),path=require('path');
let a=process.argv.slice(2);if(a[0]==='--base-dir')a=a.slice(2);
if(a[0]==='--version'){console.log(path.basename(process.argv[1])+' 0.1.0');process.exit(0)}
if(process.env.PORTALS_TEST_A||process.env.PORTALS_TEST_B)throw Error('Unrelated secret leaked into child');
const f=path.join(process.env.LORE_AUTH_PATH,'fixture.json');const who=()=>fs.existsSync(f)?fs.readFileSync(f,'utf8'):'';
if(a[0]==='auth'){
 if(a[1]==='login'){const k=a.includes('--api-key')?process.env.PORTALS_SUITE_API_KEY:fs.readFileSync(0,'utf8');if(k==='invalid-readiness-key'){console.error('Unauthenticated');process.exit(1)}fs.writeFileSync(f,k==='fixture-key-a'?'subject-a':'subject-b');process.exit(0)}
 if(a[1]==='logout'){fs.rmSync(f,{force:true});process.exit(0)}
 console.log(who());process.exit(0)
}
if(a[0]==='clone'){
 if(process.env.SIMULATE_QUIC_FAILURE){console.error('Connection refused');process.exit(1)}
 const url=a.find(x=>x.startsWith('grpcs://'))||'';
 const allowed=url.includes(who()==='subject-a'?'repo-a':'repo-b');
 if(!allowed){console.error(process.env.SIMULATE_TRANSPORT?'Connection refused':'PermissionDenied');process.exit(1)}
 const dest=a[a.length-1];
 fs.mkdirSync(path.join(dest,'data'),{recursive:true});
 fs.writeFileSync(path.join(dest,'data','readiness.txt'),'quic-fixture-content');
 process.exit(0)
}
const target=a[a.length-1];const allowed=target.includes(who()==='subject-a'?'repo-a':'repo-b');
if(!allowed){console.error(process.env.SIMULATE_TRANSPORT?'Connection refused':'PermissionDenied');process.exit(1)}
console.log('fixture-read-ok');
`
  for (const name of ['px', 'lore']) writeFileSync(join(temp, name), tool, {mode: 0o700})
  const grpcurl = `#!/usr/bin/env node
if(process.env.SIMULATE_QUIC_ENDPOINT_FAILURE){console.error('Unavailable');process.exit(1)}
console.log(JSON.stringify({environment:{endpoint:{storageUrl:process.env.SIMULATE_WRONG_QUIC_URL?'quics://other.example:44444':'quics://lore.portals.works:49735'}}}))
`
  writeFileSync(join(temp, 'grpcurl'), grpcurl, {mode: 0o700})
  const config = {
    schemaVersion: 1, name: 'runner-fixture', pxBinary: join(temp, 'px'), loreBinary: join(temp, 'lore'),
    expectedPxVersion: '0.1.0', expectedLoreVersion: '0.1.0', remoteUrl: 'grpcs://test.example',
    quic: {required: true, expectedStorageUrl: 'quics://lore.portals.works:49735', grpcurlBin: join(temp, 'grpcurl'), environmentProtoRoot: join(import.meta.dirname, '..', 'probes'), environmentTarget: 'lore.portals.works:443'},
    identities: ['a','b'].map((name, i) => ({name, expectedSubject: `subject-${name}`, apiKeyEnv: `PORTALS_TEST_${name.toUpperCase()}`, allowedRepository: `grpcs://test.example/repo-${name}`, deniedRepository: `grpcs://test.example/repo-${i ? 'a' : 'b'}`, allowedPxUri: `px://repo-${name}/fixture`, deniedPxUri: `px://repo-${i ? 'a' : 'b'}/fixture`})),
  }
  for (const identity of config.identities) identity.expectedQuicFiles = [{path: 'data/readiness.txt', sha256: 'b751bc55ff1583c72dfeea5a6cebf80a9d8541f1875e1ddb838d94f404a92d61'}]
  const profile = join(temp, 'profile.json')
  writeFileSync(profile, JSON.stringify(config))
  const run = (name, extra = {}) => {
    const report = join(temp, `${name}.json`)
    const p = spawnSync(process.execPath, [join(import.meta.dirname, 'test-network-auth.mjs'), profile, report], {encoding: 'utf8', timeout: 15000, env: {...process.env, PORTALS_TEST_A: 'fixture-key-a', PORTALS_TEST_B: 'fixture-key-b', ...extra}})
    const text = readFileSync(report, 'utf8')
    assert.ok(!text.includes('fixture-key-'))
    return {p, report: JSON.parse(text)}
  }
  const good = run('good')
  assert.equal(good.p.status, 0, good.p.stderr)
  assert.ok(good.report.passed)
  // Count the ordinary Lore/PX metadata checks separately from the distinct
  // QUIC clone-denial check; all three per identity must be present.
  assert.equal(good.report.results.filter(x => ['lore_cross_repository_denial', 'px_cross_repository_denial'].includes(x.check) && x.status === 'passed').length, 4)
  assert.equal(good.report.results.filter(x => x.check === 'lore_quic_path_cross_repository_denial' && x.status === 'passed').length, 2)
  assert.equal(good.report.results.filter(x => x.check === 'lore_quic_storage_clone' && x.status === 'passed').length, 2)
  assert.ok(good.report.results.some(x => x.check === 'quic_storage_endpoint_advertisement' && x.status === 'passed'))
  assert.match(good.report.scope, /authenticated QUIC storage clone/)
  const missing = run('missing', {PORTALS_TEST_B: ''})
  assert.equal(missing.p.status, 1)
  assert.ok(missing.report.results.some(x => x.status === 'blocked'))
  const transport = run('transport', {SIMULATE_TRANSPORT: '1'})
  assert.equal(transport.p.status, 1)
  assert.ok(transport.report.results.some(x => /cross_repository_denial/.test(x.check) && x.status === 'failed'))
  const quicTransport = run('quic-transport', {SIMULATE_QUIC_FAILURE: '1'})
  assert.equal(quicTransport.p.status, 1)
  assert.ok(quicTransport.report.results.some(x => x.check === 'lore_quic_storage_clone' && x.status === 'failed'))
  assert.ok(!quicTransport.report.results.some(x => x.check === 'lore_quic_storage_clone' && x.status === 'passed'))
  const badQuicEndpoint = run('bad-quic-endpoint', {SIMULATE_WRONG_QUIC_URL: '1'})
  assert.equal(badQuicEndpoint.p.status, 1)
  assert.ok(badQuicEndpoint.report.results.some(x => x.check === 'quic_storage_endpoint_advertisement' && x.status === 'failed'))
  assert.ok(!badQuicEndpoint.report.results.some(x => x.check === 'lore_quic_storage_clone' && x.status === 'passed'))
  config.renewal = {accessTokenTtlSeconds: 60, cycles: 2}
  writeFileSync(profile, JSON.stringify(config))
  const noJwtEvidence = run('no-jwt-evidence')
  assert.equal(noJwtEvidence.p.status, 1)
  assert.ok(noJwtEvidence.report.results.some(x => x.status === 'failed' && /actual issued TTL/.test(x.reason)))
  assert.ok(!noJwtEvidence.report.results.some(x => x.check === 'renewal_cycle_1' && x.status === 'passed'))
  console.log('Network suite orchestration: isolated identities, secret handling, reciprocal fixtures, QUIC clone/hash verification, blocked inputs and transport-vs-denial checks passed (mock clients only)')
} finally { rmSync(temp, {recursive: true, force: true}) }

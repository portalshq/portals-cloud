import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const fixture = new URL('./test-lore-aws-storage.mjs', import.meta.url)
const mockAws = `#!/usr/bin/env node
const fs = require('fs')
const args = process.argv.slice(2)
const serviceIndex = args.findIndex((item) => ['sts', 's3api', 'dynamodb'].includes(item))
const service = args[serviceIndex]
const action = args[serviceIndex + 1]
const value = (flag) => args[args.indexOf(flag) + 1]
const stateFile = process.env.TEST_AWS_STATE
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
state.actions.push(service + ':' + action)
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state))
const out = (value) => { save(); process.stdout.write(JSON.stringify(value) + '\\n') }
if (service === 'sts') out({ Account: '168692731058', Arn: 'arn:aws:sts::168692731058:assumed-role/PortalsLoreAcceptanceReadWrite/fixture' })
else if (action === 'get-bucket-location') out({ LocationConstraint: 'us-east-2' })
else if (action === 'describe-table') {
  const name = value('--table-name')
  if (name === 'known-unrelated-table') { save(); process.stderr.write('AccessDeniedException'); process.exit(254) }
  const suffix = name.split('-').at(-1)
  const keys = suffix === 'fragments' ? ['hash', 'repository_context'] : suffix === 'metadata' ? ['hash'] : suffix === 'mutable' ? ['repository_id', 'key'] : ['hash', 'repositoryBranch']
  out({ Table: { TableStatus: 'ACTIVE', TableArn: 'arn:aws:dynamodb:us-east-2:168692731058:table/' + name,
    KeySchema: keys.map((AttributeName, i) => ({ AttributeName, KeyType: i ? 'RANGE' : 'HASH' })),
    AttributeDefinitions: keys.map((AttributeName) => ({ AttributeName, AttributeType: 'B' })) } })
} else if (action === 'put-object') { state.s3 = { key: value('--key'), body: fs.readFileSync(value('--body'), 'utf8') }; out({ VersionId: 'fixture-version' }) }
else if (action === 'get-object') { fs.writeFileSync(args.at(-1), state.s3.body); out({ VersionId: 'fixture-version' }) }
else if (action === 'list-object-versions') out({ Versions: state.s3 ? [{ Key: state.s3.key, VersionId: 'fixture-version' }] : [] })
else if (action === 'delete-object') { delete state.s3; out({ VersionId: 'fixture-version' }) }
else if (action === 'put-item') { state.items[value('--table-name')] = JSON.parse(value('--item')); out({}) }
else if (action === 'get-item') out({ Item: state.items[value('--table-name')] })
else if (action === 'delete-item') { delete state.items[value('--table-name')]; out({}) }
else { save(); process.stderr.write('Unexpected mock AWS operation ' + action); process.exit(2) }
`

test('Lore AWS fixture inspects only, then exercises and cleans exact fixtures', () => {
  const directory = mkdtempSync(join(tmpdir(), 'portals-aws-script-test-'))
  try {
    const aws = join(directory, 'aws')
    const stateFile = join(directory, 'state.json')
    writeFileSync(aws, mockAws)
    chmodSync(aws, 0o755)
    const environment = { ...process.env, PATH: `${directory}:${process.env.PATH}`, TEST_AWS_STATE: stateFile }
    const options = ['--profile', 'portals-lore-acceptance', '--region', 'us-east-2', '--bucket', 'portals-prod-lore-chunks', '--deny-table', 'known-unrelated-table']
    const run = (...extra) => spawnSync(process.execPath, [fixture.pathname, ...options, ...extra], { encoding: 'utf8', env: environment, timeout: 10000 })
    writeFileSync(stateFile, JSON.stringify({ actions: [], items: {} }))
    const inspection = run()
    assert.equal(inspection.status, 0, inspection.stderr)
    assert.match(inspection.stdout, /LORE_AWS_INSPECT=PASS/)
    assert.match(inspection.stdout, /LORE_AWS_UNRELATED_TABLE_DENIAL=PASS/)
    assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).actions.some((action) => action.includes('put-')), false)
    const noDenialFixture = spawnSync(process.execPath, [fixture.pathname, '--profile', 'portals-lore-acceptance', '--region', 'us-east-2', '--bucket', 'portals-prod-lore-chunks', '--exercise'], { encoding: 'utf8', env: environment, timeout: 10000 })
    assert.notEqual(noDenialFixture.status, 0)
    const exercise = run('--exercise')
    assert.equal(exercise.status, 0, exercise.stderr)
    assert.match(exercise.stdout, /LORE_AWS_STORAGE_ACCEPTANCE=PASS/)
    const state = JSON.parse(readFileSync(stateFile, 'utf8'))
    assert.deepEqual(state.items, {})
    assert.equal(state.s3, undefined)
    assert.equal(state.actions.filter((action) => action === 'dynamodb:put-item').length, 4)
    assert.equal(state.actions.filter((action) => action === 'dynamodb:delete-item').length, 4)
    assert.equal(state.actions.filter((action) => action === 's3api:delete-object').length, 1)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

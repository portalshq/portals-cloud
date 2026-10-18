#!/usr/bin/env node
/** A deliberately small, self-cleaning AWS storage acceptance fixture. */
import { spawnSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const expectedAccount = '168692731058'
const expectedBucket = 'portals-prod-lore-chunks'
const expectedTables = {
  fragments: { name: 'portals-prod-lore-fragments', keys: [['hash', 'B'], ['repository_context', 'B']] },
  metadata: { name: 'portals-prod-lore-metadata', keys: [['hash', 'B']] },
  mutable: { name: 'portals-prod-lore-mutable', keys: [['repository_id', 'B'], ['key', 'B']] },
  locks: { name: 'portals-prod-lore-locks', keys: [['hash', 'B'], ['repositoryBranch', 'B']] },
}

function usage() {
  throw new Error('Usage: test-lore-aws-storage.mjs --profile NAME --region REGION --bucket NAME [--exercise] [--deny-table EXISTING_UNRELATED_TABLE]')
}

const args = process.argv.slice(2)
const option = (name) => {
  const index = args.indexOf(name)
  if (index < 0) return undefined
  if (!args[index + 1] || args[index + 1].startsWith('--')) usage()
  return args[index + 1]
}
const profile = option('--profile')
const region = option('--region')
const bucket = option('--bucket')
const denyTable = option('--deny-table')
const exercise = args.includes('--exercise')
if (!profile || !region || !bucket || profile === 'default') usage()
if (exercise && !denyTable) usage()
if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(profile)) usage()
if (!/^[a-z]{2}-[a-z]+-\d$/.test(region)) usage()
if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) usage()
if (bucket !== expectedBucket) throw new Error(`Bucket must match the reviewed Lore production bucket: ${expectedBucket}`)
if (denyTable && (!/^[A-Za-z0-9_.-]{3,255}$/.test(denyTable) || Object.values(expectedTables).some((entry) => entry.name === denyTable))) usage()
const allowed = new Set(['--profile', '--region', '--bucket', '--deny-table', '--exercise'])
for (let i = 0; i < args.length; i += 1) {
  if (!allowed.has(args[i])) usage()
  if (args[i] !== '--exercise') i += 1
}

function aws(parts, outputFile) {
  const command = ['--profile', profile, '--region', region, '--no-cli-pager', '--output', 'json', ...parts]
  if (outputFile) command.push(outputFile)
  const result = spawnSync('aws', command, { encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024 })
  if (result.error) throw new Error(`AWS command failed to run: ${result.error.code ?? result.error.message}`)
  if (result.status !== 0) {
    const denied = /AccessDenied|not authorized|UnauthorizedOperation/.test(result.stderr)
    const conditional = /ConditionalCheckFailed/.test(result.stderr)
    const missing = /ResourceNotFound|NoSuchBucket|NotFound/.test(result.stderr)
    const kind = denied ? 'ACCESS_DENIED' : conditional ? 'CONDITIONAL_CHECK_FAILED' : missing ? 'RESOURCE_NOT_FOUND' : 'AWS_COMMAND_FAILED'
    throw Object.assign(new Error(`${kind}: ${parts[0]} ${parts[1] ?? ''}`), { kind })
  }
  return result.stdout.trim() ? JSON.parse(result.stdout) : {}
}

function inspectTable(table) {
  const { Table: described } = aws(['dynamodb', 'describe-table', '--table-name', table.name])
  if (!described || described.TableStatus !== 'ACTIVE' || described.TableArn !== `arn:aws:dynamodb:${region}:${expectedAccount}:table/${table.name}`) {
    throw new Error(`Unexpected DynamoDB table identity or state: ${table.name}`)
  }
  const actual = described.KeySchema.map(({ AttributeName }) => [AttributeName, described.AttributeDefinitions.find((item) => item.AttributeName === AttributeName)?.AttributeType])
  if (JSON.stringify(actual) !== JSON.stringify(table.keys)) throw new Error(`Unexpected DynamoDB key schema: ${table.name}`)
  return described
}

const caller = aws(['sts', 'get-caller-identity'])
if (caller.Account !== expectedAccount || !new RegExp(`^arn:aws:sts::${expectedAccount}:assumed-role/PortalsLoreAcceptanceReadWrite/`).test(caller.Arn)) {
  throw new Error('Refusing AWS access: expected the scoped PortalsLoreAcceptanceReadWrite role in account 168692731058')
}
const location = aws(['s3api', 'get-bucket-location', '--bucket', bucket])
const bucketRegion = location.LocationConstraint || 'us-east-1'
if (bucketRegion !== region) throw new Error(`Bucket region mismatch: expected ${region}, found ${bucketRegion}`)
for (const table of Object.values(expectedTables)) inspectTable(table)
console.log(`LORE_AWS_INSPECT=PASS role=PortalsLoreAcceptanceReadWrite bucket=${bucket} tables=4 region=${region}`)

if (denyTable) {
  try {
    aws(['dynamodb', 'describe-table', '--table-name', denyTable])
    throw new Error('UNRELATED_TABLE_ACCESS_ALLOWED')
  } catch (error) {
    if (error.kind !== 'ACCESS_DENIED') throw error
    console.log('LORE_AWS_UNRELATED_TABLE_DENIAL=PASS')
  }
}
if (!exercise) process.exit(0)

const runId = randomUUID()
const key = `acceptance/${runId}/storage-fixture`
const body = `portals-lore-aws-acceptance:${runId}\n`
const directory = mkdtempSync(join(tmpdir(), 'portals-lore-aws-'))
const input = join(directory, 'input')
const output = join(directory, 'output')
writeFileSync(input, body, { mode: 0o600 })
let s3PutAttempted = false
const attempted = []
let failure
try {
  s3PutAttempted = true
  const placed = aws(['s3api', 'put-object', '--bucket', bucket, '--key', key, '--body', input])
  if (!placed.VersionId || placed.VersionId === 'null') throw new Error('Versioned S3 bucket did not return a VersionId')
  aws(['s3api', 'get-object', '--bucket', bucket, '--key', key], output)
  if (readFileSync(output, 'utf8') !== body) throw new Error('S3 readback did not match fixture')
  console.log('LORE_AWS_S3_READ_WRITE=PASS')

  for (const table of Object.values(expectedTables)) {
    const keyValue = Object.fromEntries(table.keys.map(([name]) => [name, { B: randomBytes(32).toString('base64') }]))
    const item = { ...keyValue, acceptance_run: { S: runId } }
    const fixture = { table, keyValue, placed: false }
    attempted.push(fixture)
    aws(['dynamodb', 'put-item', '--table-name', table.name, '--item', JSON.stringify(item), '--condition-expression', 'attribute_not_exists(#pk)', '--expression-attribute-names', JSON.stringify({ '#pk': table.keys[0][0] })])
    fixture.placed = true
    const read = aws(['dynamodb', 'get-item', '--table-name', table.name, '--key', JSON.stringify(keyValue), '--consistent-read'])
    if (read.Item?.acceptance_run?.S !== runId) throw new Error(`DynamoDB readback failed: ${table.name}`)
    console.log(`LORE_AWS_DYNAMODB_READ_WRITE=PASS table=${table.name}`)
  }
} catch (error) {
  failure = error
} finally {
  for (const { table, keyValue, placed } of attempted.reverse()) {
    try {
      aws(['dynamodb', 'delete-item', '--table-name', table.name, '--key', JSON.stringify(keyValue), '--condition-expression', 'acceptance_run = :run', '--expression-attribute-values', JSON.stringify({ ':run': { S: runId } })])
    } catch (error) {
      if (error.kind === 'CONDITIONAL_CHECK_FAILED' && !placed) continue
      console.error(`LORE_AWS_CLEANUP_FAILED table=${table.name} error=${error.message}`)
      failure ||= error
    }
  }
  if (s3PutAttempted) {
    try {
      const listed = aws(['s3api', 'list-object-versions', '--bucket', bucket, '--prefix', key, '--max-items', '10'])
      const versions = [...(listed.Versions ?? []), ...(listed.DeleteMarkers ?? [])].filter((item) => item.Key === key)
      if (listed.NextToken || versions.length > 1) throw new Error('Unexpected number of fixture versions; manual cleanup required')
      for (const version of versions) aws(['s3api', 'delete-object', '--bucket', bucket, '--key', key, '--version-id', version.VersionId])
      if (versions.length) console.log('LORE_AWS_S3_FIXTURE_CLEANUP=PASS')
    } catch (error) {
      console.error(`LORE_AWS_CLEANUP_FAILED s3_key=${key} error=${error.message}`)
      failure ||= error
    }
  }
  rmSync(directory, { recursive: true, force: true })
}
if (failure) throw failure
console.log('LORE_AWS_STORAGE_ACCEPTANCE=PASS fixtures_removed=yes')

import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'

const schemas = {
  FRAGMENTS: [['hash', 'B'], ['repository_context', 'B']],
  METADATA: [['hash', 'B']],
  MUTABLE: [['repository_id', 'B'], ['key', 'B']],
  LOCKS: [['hash', 'B'], ['repositoryBranch', 'B']],
}
const indexes = {
  'owner-repo-branch': [['ownerId', 'S'], ['repositoryBranch', 'B']],
  'repo-branch-description': [['repositoryBranch', 'B'], ['description', 'S']],
  'repo-branch': [['repository', 'B'], ['branch', 'B']],
}
function checkKeys(table, keySchema, expected) {
  assert.equal(keySchema.length, expected.length, 'wrong number of table/index keys')
  for (const [index, [name, type]] of expected.entries()) {
    assert.ok(keySchema.some(key => key.AttributeName === name && key.KeyType === (index ? 'RANGE' : 'HASH')), `missing ${name} key`)
    assert.ok(table.AttributeDefinitions.some(key => key.AttributeName === name && key.AttributeType === type), `${name} must have type ${type}`)
  }
}
if (process.argv.includes('--self-test')) {
  const table = {AttributeDefinitions: [{AttributeName: 'hash', AttributeType: 'B'}]}
  const keys = [{AttributeName: 'hash', KeyType: 'HASH'}]
  checkKeys(table, keys, schemas.METADATA)
  assert.throws(() => checkKeys(table, keys, [['hash', 'S']]))
  assert.throws(() => checkKeys(table, keys, schemas.FRAGMENTS))
  console.log('Storage schema checks reject incorrect binary keys and missing sort keys')
} else {
  const input = name => {
    const value = process.env[name]
    assert.ok(value && !/__REPLACE_|[<>]/.test(value), `missing/placeholder storage input: ${name}`)
    return value
  }
  const region = input('AWS_REGION')
  const aws = (...args) => JSON.parse(execFileSync('aws', [...args, '--region', region, '--output', 'json', '--no-cli-pager'], {encoding: 'utf8', timeout: 30000}))
  const bucket = input('LORE__PLUGINS__AWS__IMMUTABLE_STORE__S3_BUCKET')
  const publicBlock = aws('s3api', 'get-public-access-block', '--bucket', bucket).PublicAccessBlockConfiguration
  for (const flag of ['BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets']) assert.equal(publicBlock[flag], true, `S3 ${flag} must be enabled`)
  assert.equal(aws('s3api', 'get-bucket-versioning', '--bucket', bucket).Status, 'Enabled', 'S3 versioning required')
  assert.ok(aws('s3api', 'get-bucket-encryption', '--bucket', bucket).ServerSideEncryptionConfiguration.Rules.length, 'S3 encryption required')
  for (const [kind, expected] of Object.entries(schemas)) {
    const variable = kind === 'FRAGMENTS' || kind === 'METADATA'
      ? `LORE__PLUGINS__AWS__IMMUTABLE_STORE__DYNAMODB_${kind}_TABLE`
      : `LORE__PLUGINS__AWS__${kind === 'LOCKS' ? 'LOCK' : kind}_STORE__DYNAMODB_TABLE`
    const name = input(variable)
    const table = aws('dynamodb', 'describe-table', '--table-name', name).Table
    assert.equal(table.TableStatus, 'ACTIVE', `${kind} table must be active`)
    checkKeys(table, table.KeySchema, expected)
    if (kind === 'LOCKS') for (const [indexName, keys] of Object.entries(indexes)) {
      const index = table.GlobalSecondaryIndexes?.find(value => value.IndexName === indexName)
      assert.equal(index?.IndexStatus, 'ACTIVE', `${indexName} must be active`)
      assert.equal(index.Projection.ProjectionType, 'ALL', `${indexName} projection must be ALL`)
      checkKeys(table, index.KeySchema, keys)
    }
    const backup = aws('dynamodb', 'describe-continuous-backups', '--table-name', name).ContinuousBackupsDescription
    console.log(`${kind}: schema verified; PITR=${backup.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus ?? 'unknown'}; billing=${table.BillingModeSummary?.BillingMode ?? 'PROVISIONED'}`)
  }
  console.log('Read-only storage configuration checks passed; application read/write, IAM denial, and isolated restore drills remain required')
}

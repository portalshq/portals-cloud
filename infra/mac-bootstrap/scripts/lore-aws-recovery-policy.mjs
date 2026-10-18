#!/usr/bin/env node
// Generate a reviewable, resource-scoped restore-role policy. The target S3
// bucket must already exist; this script never provisions or restores data.
const args = process.argv.slice(2)
if (args.length !== 8 || args[0] !== '--region' || args[2] !== '--source-bucket' || args[4] !== '--target-bucket' || args[6] !== '--target-prefix') {
  throw new Error('Usage: lore-aws-recovery-policy.mjs --region REGION --source-bucket EXACT_LORE_BUCKET --target-bucket portals-restore-... --target-prefix portals-restore-...')
}
const region = args[1]
const sourceBucket = args[3]
const targetBucket = args[5]
const targetPrefix = args[7]
const bucketName = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/
if (!/^[a-z]{2}-[a-z]+-\d$/.test(region) || !bucketName.test(sourceBucket) || !bucketName.test(targetBucket) || !targetBucket.startsWith('portals-restore-') || !/^portals-restore-[a-z0-9-]{1,50}$/.test(targetPrefix)) {
  throw new Error('Invalid region or resource name; restore targets must use the portals-restore- namespace')
}
if (sourceBucket === targetBucket) throw new Error('Restore bucket must differ from source bucket')
if (sourceBucket !== 'portals-prod-lore-chunks') throw new Error('Source bucket must match the reviewed Lore production bucket')
const account = '168692731058'
const suffixes = ['fragments', 'metadata', 'mutable', 'locks']
const sourceNames = suffixes.map((suffix) => `portals-prod-lore-${suffix}`)
const targetNames = suffixes.map((suffix) => `${targetPrefix}-${suffix}`)
if (targetNames.some((name) => sourceNames.includes(name))) throw new Error('Restore table must differ from source table')
const tableArn = (name) => `arn:aws:dynamodb:${region}:${account}:table/${name}`
const sourceArns = sourceNames.map(tableArn)
const targetArns = targetNames.map(tableArn)
const policy = {
  Version: '2012-10-17',
  Statement: [
    {
      Sid: 'InspectSourcePitr', Effect: 'Allow',
      Action: ['dynamodb:DescribeTable', 'dynamodb:DescribeContinuousBackups'],
      Resource: sourceArns,
    },
    {
      Sid: 'RestoreOnlyLoreSources', Effect: 'Allow',
      Action: ['dynamodb:RestoreTableToPointInTime'],
      Resource: sourceArns,
    },
    {
      Sid: 'OperateOnlyNamedRestoreTables', Effect: 'Allow',
      Action: ['dynamodb:DescribeTable', 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem', 'dynamodb:Query', 'dynamodb:Scan', 'dynamodb:BatchWriteItem', 'dynamodb:TagResource'],
      Resource: targetArns,
    },
    {
      Sid: 'ReadSourceBucketVersions', Effect: 'Allow',
      Action: ['s3:GetBucketLocation', 's3:ListBucketVersions'],
      Resource: `arn:aws:s3:::${sourceBucket}`,
    },
    {
      Sid: 'ReadSourceObjectVersions', Effect: 'Allow',
      Action: ['s3:GetObjectVersion'],
      Resource: `arn:aws:s3:::${sourceBucket}/*`,
    },
    {
      Sid: 'WriteOnlyIsolatedRestoreBucket', Effect: 'Allow',
      Action: ['s3:PutObject', 's3:GetObject'],
      Resource: `arn:aws:s3:::${targetBucket}/*`,
    },
    {
      Sid: 'InspectIsolatedRestoreBucket', Effect: 'Allow',
      Action: ['s3:GetBucketLocation', 's3:ListBucket'],
      Resource: `arn:aws:s3:::${targetBucket}`,
    },
  ],
}
process.stdout.write(`${JSON.stringify(policy, null, 2)}\n`)

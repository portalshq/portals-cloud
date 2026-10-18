#!/usr/bin/env node
// Emit the inline permissions policy for the separate acceptance role. This
// never creates an IAM resource or includes a trust policy.
const args = process.argv.slice(2)
if (args.length !== 4 || args[0] !== '--region' || args[2] !== '--bucket') {
  throw new Error('Usage: lore-aws-acceptance-policy.mjs --region REGION --bucket EXACT_LORE_BUCKET')
}
const region = args[1]
const bucket = args[3]
if (!/^[a-z]{2}-[a-z]+-\d$/.test(region) || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
  throw new Error('Invalid region or bucket')
}
if (bucket !== 'portals-prod-lore-chunks') throw new Error('Bucket must match the reviewed Lore production bucket')
const account = '168692731058'
const names = ['fragments', 'metadata', 'mutable', 'locks'].map((suffix) => `portals-prod-lore-${suffix}`)
const policy = {
  Version: '2012-10-17',
  Statement: [
    {
      Sid: 'InspectLoreBucket', Effect: 'Allow',
      Action: ['s3:GetBucketLocation'], Resource: `arn:aws:s3:::${bucket}`,
    },
    {
      Sid: 'ListOnlyAcceptanceVersions', Effect: 'Allow',
      Action: ['s3:ListBucketVersions'], Resource: `arn:aws:s3:::${bucket}`,
      Condition: { StringLike: { 's3:prefix': 'acceptance/*' } },
    },
    {
      Sid: 'ExerciseOnlyAcceptanceObjects', Effect: 'Allow',
      Action: ['s3:PutObject', 's3:GetObject', 's3:DeleteObjectVersion'],
      Resource: `arn:aws:s3:::${bucket}/acceptance/*`,
    },
    {
      Sid: 'InspectAndExerciseOnlyLoreTables', Effect: 'Allow',
      Action: ['dynamodb:DescribeTable', 'dynamodb:PutItem', 'dynamodb:GetItem', 'dynamodb:DeleteItem'],
      Resource: names.map((name) => `arn:aws:dynamodb:${region}:${account}:table/${name}`),
    },
  ],
}
process.stdout.write(`${JSON.stringify(policy, null, 2)}\n`)

import test from 'node:test'
import assert from 'node:assert/strict'
import {executeDelivery} from './delivery.js'

const job = {id: 'job-1', accountId: 'acct', repositoryId: 'repo-1', attemptCount: 1}
const manifest = {jobId: 'job-1', buyerId: 'buyer', accountId: 'acct', repositoryId: 'repo-1', sourceRevision: 'rev', files: [], packageSha256: 'digest'}

test('executeDelivery rejects a Lore repository mismatch before completion', async () => {
  const adapter = {deliver: async () => ({repositoryId: 'repo-2', commitHash: 'commit'})}
  await assert.rejects(() => executeDelivery({pool: {} as any, workerId: 'worker', job, manifest, endpoint: 'https://lore', machineToken: 'token', adapter}), /repository identity mismatch/)
})

test('executeDelivery requires a non-empty verified commit hash', async () => {
  const adapter = {deliver: async () => ({repositoryId: 'repo-1', commitHash: '  '})}
  await assert.rejects(() => executeDelivery({pool: {} as any, workerId: 'worker', job, manifest, endpoint: 'https://lore', machineToken: 'token', adapter}), /empty commit hash/)
})

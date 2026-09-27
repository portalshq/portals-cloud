import test from 'node:test'
import assert from 'node:assert/strict'
import {claimNextJob, markCompleted} from './jobs.js'

test('claimNextJob claims one eligible row and returns its lease identity', async () => {
  const queries: Array<{sql: string; args?: unknown[]}> = []
  const client = {
    query: async (sql: string, args?: unknown[]) => {
      queries.push({sql, args})
      if (sql.startsWith('SELECT')) return {rows: [{id: 'job-1', account_id: 'acct', repository_id: 'repo', manifest_ref: 'manifest-1', attempt_count: 2}]}
      return {rows: []}
    },
    release: () => undefined,
  }
  const pool = {connect: async () => client} as any
  const job = await claimNextJob(pool, 'worker-1', new Date('2026-01-01T00:00:00Z'))
  assert.deepEqual(job, {id: 'job-1', accountId: 'acct', repositoryId: 'repo', manifestRef: 'manifest-1', attemptCount: 3})
  assert.equal(queries.some((query) => query.sql.includes("state = 'claimed'")), true)
})

test('markCompleted requires the current lease and records the verified result', async () => {
  const statements: string[] = []
  const client = {
    query: async (sql: string) => {
      statements.push(sql)
      if (sql.startsWith('UPDATE')) return {rowCount: 1, rows: [{id: 'job-1'}]}
      return {rowCount: 1, rows: []}
    },
    release: () => undefined,
  }
  const pool = {connect: async () => client} as any
  await markCompleted(pool, 'job-1', 'worker-1', 'sha256:pkg', 'repo-1', 'commit-1')
  assert.equal(statements.some((sql) => sql.includes("state = 'completed'")), true)
  assert.equal(statements.some((sql) => sql.includes('delivery_completed')), true)
})

import dotenv from 'dotenv'
import {syncSubmissionToApollo} from '../src/lib/leads/crm'
import {getSubmission, leadPool, markSubmissionSynced} from '../src/lib/leads/store'

dotenv.config({path: '.env.local'})

const DEFAULT_SINCE = '2026-08-10T00:00:00.000Z'

function argValue(name: string): string | undefined {
  const prefix = `${name}=`
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
}

function flag(name: string): boolean {
  return process.argv.includes(name)
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${value} is not a positive integer.`)
  return parsed
}

const apply = flag('--apply')
const missingOnly = flag('--missing-only')
const sinceRaw = argValue('--since') || DEFAULT_SINCE
const since = new Date(sinceRaw)
if (Number.isNaN(since.getTime())) throw new Error(`Invalid --since value: ${sinceRaw}`)
const limit = positiveInteger(argValue('--limit'), 500)

type SubmissionRow = {
  id: string
  submission_type: string
  created_at: Date | string
}

const pool = leadPool()

try {
  const missingClause = missingOnly
    ? `AND NOT EXISTS (
         SELECT 1 FROM crm_external_records record
          WHERE record.source_type = 'lead_profile'
            AND record.source_id = lead_submissions.profile_id
            AND record.remote_type = 'contact'
       )`
    : ''
  const result = await pool.query<SubmissionRow>(
    `SELECT id, submission_type, created_at
       FROM lead_submissions
      WHERE verified = true
        AND provider = 'browser'
        AND submission_type <> 'commercial_event'
        AND created_at >= $1
        ${missingClause}
      ORDER BY created_at ASC
      LIMIT $2`,
    [since.toISOString(), limit],
  )
  const rows = result.rows
  const byType = rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.submission_type] = (counts[row.submission_type] || 0) + 1
    return counts
  }, {})

  process.stdout.write(
    `${apply ? 'Applying' : 'Dry run:'} Apollo lead backfill since ${since.toISOString()} for ${rows.length} verified submissions.\n`,
  )
  process.stdout.write(`By type: ${JSON.stringify(byType)}\n`)
  if (!apply) {
    process.stdout.write('Pass --apply to create/update Apollo records. Use --missing-only to limit to profiles without a local Apollo contact mapping.\n')
  } else {
    let synced = 0
    const failures: Array<{id: string; error: string}> = []
    for (const row of rows) {
      try {
        const submission = await getSubmission(row.id)
        await syncSubmissionToApollo(submission)
        await pool.query(
          `UPDATE lead_outbox
              SET status = 'complete', completed_at = now(), updated_at = now()
            WHERE submission_id = $1
              AND action_type = 'apollo_sync'
              AND status <> 'complete'`,
          [row.id],
        )
        await markSubmissionSynced(row.id)
        synced += 1
        process.stdout.write(`synced ${row.submission_type} ${row.id}\n`)
      } catch (error) {
        failures.push({id: row.id, error: String(error)})
        process.stderr.write(`failed ${row.submission_type} ${row.id}: ${String(error)}\n`)
      }
    }

    process.stdout.write(`\nApollo backfill complete: ${synced} synced, ${failures.length} failed.\n`)
    if (failures.length) process.exitCode = 1
  }
} finally {
  await pool.end()
}

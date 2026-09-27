import type {Pool, PoolClient} from 'pg'

export type DeliveryJob = {
  id: string
  accountId: string
  repositoryId: string
  manifestRef?: string
  attemptCount: number
}

export async function claimNextJob(pool: Pool, workerId: string, now = new Date()): Promise<DeliveryJob | null> {
  const client: PoolClient = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query<{
      id: string
      account_id: string
      repository_id: string
      manifest_ref: string | null
      attempt_count: number
    }>(
      `SELECT id, account_id, repository_id, manifest_ref, attempt_count
         FROM delivery_jobs
        WHERE state IN ('queued', 'retryable_failure')
          AND (next_retry_at IS NULL OR next_retry_at <= $1)
          AND (lease_expires_at IS NULL OR lease_expires_at <= $1)
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
      [now],
    )
    const row = result.rows[0]
    if (!row) {
      await client.query('ROLLBACK')
      return null
    }
    const leaseExpiresAt = new Date(now.getTime() + 10 * 60 * 1000)
    await client.query(
      `UPDATE delivery_jobs
          SET state = 'claimed', lease_owner = $1, lease_expires_at = $2,
              attempt_count = attempt_count + 1, updated_at = now()
        WHERE id = $3`,
      [workerId, leaseExpiresAt, row.id],
    )
    await client.query(
      `INSERT INTO delivery_audit_events(job_id, service_identity, event_type, outcome, detail)
       VALUES ($1, $2, 'delivery_claimed', 'success', $3::jsonb)`,
      [row.id, workerId, JSON.stringify({attempt: row.attempt_count + 1})],
    )
    await client.query('COMMIT')
    return {
      id: row.id,
      accountId: row.account_id,
      repositoryId: row.repository_id,
      manifestRef: row.manifest_ref ?? undefined,
      attemptCount: row.attempt_count + 1,
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function markRetryableFailure(pool: Pool, jobId: string, workerId: string, code: string, summary: string, nextRetryAt: Date) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE delivery_jobs
          SET state = 'retryable_failure', lease_owner = NULL, lease_expires_at = NULL,
              next_retry_at = $1, last_error_code = $2, last_error_summary = $3, updated_at = now()
        WHERE id = $4 AND lease_owner = $5`,
      [nextRetryAt, code, summary.slice(0, 500), jobId, workerId],
    )
    await client.query(
      `INSERT INTO delivery_audit_events(job_id, service_identity, event_type, outcome, detail)
       VALUES ($1, $2, 'delivery_retry_scheduled', 'failure', $3::jsonb)`,
      [jobId, workerId, JSON.stringify({code, nextRetryAt})],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function markManualReview(pool: Pool, jobId: string, workerId: string, code: string, summary: string) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE delivery_jobs
          SET state = 'manual_review', lease_owner = NULL, lease_expires_at = NULL,
              last_error_code = $1, last_error_summary = $2, updated_at = now()
        WHERE id = $3 AND lease_owner = $4`,
      [code, summary.slice(0, 500), jobId, workerId],
    )
    await client.query(
      `INSERT INTO delivery_audit_events(job_id, service_identity, event_type, outcome, detail)
       VALUES ($1, $2, 'delivery_manual_review', 'failure', $3::jsonb)`,
      [jobId, workerId, JSON.stringify({code})],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function markCompleted(
  pool: Pool,
  jobId: string,
  workerId: string,
  packageDigest: string,
  repositoryId: string,
  commitHash: string,
) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query(
      `UPDATE delivery_jobs
          SET state = 'completed', lease_owner = NULL, lease_expires_at = NULL,
              package_digest = $1, lore_repository_id = $2, commit_hash = $3,
              completed_at = now(), updated_at = now()
        WHERE id = $4 AND lease_owner = $5 AND state = 'claimed'
        RETURNING id`,
      [packageDigest, repositoryId, commitHash, jobId, workerId],
    )
    if (result.rowCount !== 1) throw new Error('delivery completion lease lost')
    await client.query(
      `INSERT INTO delivery_audit_events(job_id, service_identity, event_type, outcome, detail)
       VALUES ($1, $2, 'delivery_completed', 'success', $3::jsonb)`,
      [jobId, workerId, JSON.stringify({packageDigest, repositoryId, commitHash})],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

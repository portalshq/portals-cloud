import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'

// PGlite twin of reconciliation/reconcile.sql: same join keys, statuses, period
// reporting and parameterized lateness. The shipped query is BigQuery dialect.
it('reconciles missing, duplicated, mismatched, unexpected and late committed events by period', async () => {
  const db = new PGlite()
  try {
    await db.exec(`CREATE TABLE source(source_kind text, source_id text, event_name text, occurred_at timestamptz, amount integer, refunded_amount integer, currency text);
      CREATE TABLE delivered(source_kind text, source_id text, event_name text, occurred_at timestamptz, received_at timestamptz, amount integer, refunded_amount integer, currency text);
      INSERT INTO source VALUES ('billing','1','billing.purchase_settled','2026-01-01',100,0,'usd'),('billing','2','billing.purchase_refunded','2026-01-01',100,100,'usd'),('billing','3','billing.purchase_disputed','2026-01-01',100,0,'usd'),('interaction','4','interaction.resolution_committed','2026-01-01',NULL,NULL,NULL);
      INSERT INTO delivered VALUES ('billing','1','billing.purchase_settled','2026-01-01','2026-01-01T00:01:00Z',100,0,'usd'),('billing','1','billing.purchase_settled','2026-01-01','2026-01-01T00:02:00Z',100,0,'usd'),('billing','2','billing.purchase_refunded','2026-01-01','2026-01-04',100,90,'usd'),('interaction','4','interaction.resolution_committed','2026-01-01','2026-01-01T00:01:00Z',NULL,NULL,NULL),('billing','9','billing.purchase_settled','2026-01-02','2026-01-02T00:01:00Z',50,0,'usd');`)
    const lateThreshold = '24 hours'
    const result = await db.query(`WITH grouped AS (SELECT source_kind, source_id, count(*) deliveries FROM delivered GROUP BY source_kind, source_id),
        first_delivery AS (SELECT DISTINCT ON (source_kind, source_id) * FROM delivered ORDER BY source_kind, source_id, received_at)
      SELECT DATE(COALESCE(s.occurred_at,f.occurred_at))::text period, COALESCE(s.source_id,f.source_id) source_id,
        CASE WHEN s.source_id IS NULL THEN 'unexpected' WHEN f.source_id IS NULL THEN 'missing'
        WHEN s.event_name IS DISTINCT FROM f.event_name OR s.amount IS DISTINCT FROM f.amount OR s.refunded_amount IS DISTINCT FROM f.refunded_amount OR s.currency IS DISTINCT FROM f.currency THEN 'mismatch' ELSE 'matched' END status,
        COALESCE(g.deliveries,0)>1 is_duplicate, COALESCE(f.received_at > s.occurred_at + $1::interval,false) is_late
      FROM source s FULL OUTER JOIN first_delivery f USING (source_kind, source_id)
      LEFT JOIN grouped g USING (source_kind, source_id) ORDER BY period, source_id`, [lateThreshold])
    expect(result.rows).toEqual([
      {period:'2026-01-01',source_id:'1',status:'matched',is_duplicate:true,is_late:false},
      {period:'2026-01-01',source_id:'2',status:'mismatch',is_duplicate:false,is_late:true},
      {period:'2026-01-01',source_id:'3',status:'missing',is_duplicate:false,is_late:false},
      {period:'2026-01-01',source_id:'4',status:'matched',is_duplicate:false,is_late:false},
      {period:'2026-01-02',source_id:'9',status:'unexpected',is_duplicate:false,is_late:false},
    ])
    // A tighter delivery expectation reclassifies marginal deliveries as late.
    const stricter = await db.query(`SELECT COALESCE(d.received_at > s.occurred_at + $1::interval,false) is_late
      FROM source s JOIN delivered d USING (source_kind, source_id) WHERE s.source_id='4'`, ['30 minutes'])
    expect(stricter.rows[0]).toEqual({ is_late: false })
    const tightest = await db.query(`SELECT COALESCE(d.received_at > s.occurred_at + $1::interval,false) is_late
      FROM source s JOIN delivered d USING (source_kind, source_id) WHERE s.source_id='4'`, ['30 seconds'])
    expect(tightest.rows[0]).toEqual({ is_late: true })
  } finally { await db.close() }
}, 15_000)

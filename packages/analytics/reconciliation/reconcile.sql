-- BigQuery Standard SQL. Replace the two input CTEs with normalized, authorized
-- source snapshots and Segment warehouse views. Both must expose the columns
-- shown in the fixture below. Source records are keyed by the original source
-- identity (source_kind + source_id), which the connector forwards as the
-- approved properties portals_source_kind and portals_source_id; Segment
-- messageId / portals_event_id carries the namespaced delivery ID.
--
-- `late_threshold` is the configured Segment-to-BigQuery delivery expectation
-- for this feed (e.g. the warehouse sync interval plus margin). It is an
-- operator input, not a production fact baked into this file.
DECLARE late_threshold INTERVAL DEFAULT INTERVAL 24 HOUR;

WITH source AS (
 SELECT 'billing' source_kind, '1' source_id, 'billing.purchase_settled' event_name, TIMESTAMP '2026-01-01 00:00:00+00' occurred_at, 100 amount, 0 refunded_amount, 'usd' currency UNION ALL
 SELECT 'billing', '2', 'billing.purchase_refunded', TIMESTAMP '2026-01-01 00:00:00+00', 100, 100, 'usd' UNION ALL
 SELECT 'billing', '3', 'billing.purchase_disputed', TIMESTAMP '2026-01-01 00:00:00+00', 100, 0, 'usd' UNION ALL
 SELECT 'interaction', '4', 'interaction.resolution_committed', TIMESTAMP '2026-01-01 00:00:00+00', CAST(NULL AS INT64), CAST(NULL AS INT64), CAST(NULL AS STRING)
), delivered AS (
 SELECT 'billing' source_kind, '1' source_id, 'billing.purchase_settled' event_name, TIMESTAMP '2026-01-01 00:00:00+00' occurred_at, TIMESTAMP '2026-01-01 00:01:00+00' received_at, 100 amount, 0 refunded_amount, 'usd' currency UNION ALL
 SELECT 'billing', '1', 'billing.purchase_settled', TIMESTAMP '2026-01-01 00:00:00+00', TIMESTAMP '2026-01-01 00:02:00+00', 100, 0, 'usd' UNION ALL
 SELECT 'billing', '2', 'billing.purchase_refunded', TIMESTAMP '2026-01-01 00:00:00+00', TIMESTAMP '2026-01-04 00:00:00+00', 100, 90, 'usd' UNION ALL
 SELECT 'interaction', '4', 'interaction.resolution_committed', TIMESTAMP '2026-01-01 00:00:00+00', TIMESTAMP '2026-01-01 00:01:00+00', NULL, NULL, NULL
), grouped AS (
 SELECT source_kind, source_id, COUNT(*) deliveries,
   ARRAY_AGG(STRUCT(event_name, occurred_at, received_at, amount, refunded_amount, currency) ORDER BY received_at LIMIT 1)[OFFSET(0)] event
 FROM delivered GROUP BY source_kind, source_id
)
SELECT
 DATE(COALESCE(s.occurred_at, d.event.occurred_at)) period,
 COALESCE(s.source_kind, d.source_kind) source_kind,
 COALESCE(s.source_id, d.source_id) source_id,
 s.event_name source_event,
 d.deliveries,
 CASE WHEN s.source_id IS NULL THEN 'unexpected' WHEN d.source_id IS NULL THEN 'missing'
   WHEN s.event_name IS DISTINCT FROM d.event.event_name OR s.amount IS DISTINCT FROM d.event.amount
     OR s.refunded_amount IS DISTINCT FROM d.event.refunded_amount OR s.currency IS DISTINCT FROM d.event.currency THEN 'mismatch'
   ELSE 'matched' END status,
 COALESCE(d.deliveries, 0) > 1 is_duplicate,
 d.event.received_at > s.occurred_at + late_threshold is_late
FROM source s FULL OUTER JOIN grouped d USING (source_kind, source_id)
ORDER BY period, source_kind, source_id;

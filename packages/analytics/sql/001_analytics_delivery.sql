-- Delivery ledger for @portalshq/analytics.
--
-- This schema is owned and applied by the analytics connector itself through
-- portals_analytics_migrations. It never changes business source tables:
-- monetization_outbox and interaction_outbox are read-only inputs retained by
-- their owning packages.
--
-- Migration: 001_analytics_delivery.sql
-- Version: 0.1.0

-- Applied-migration ledger. Guards restart and concurrent startup.
CREATE TABLE IF NOT EXISTS portals_analytics_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- One record per destination/source event. Rows are retained after delivery so
-- reconciliation and operator inspection have durable evidence.
CREATE TABLE IF NOT EXISTS portals_analytics_delivery (
  destination text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('billing', 'interaction')),
  source_id text NOT NULL,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'delivered', 'excluded', 'blocked', 'dead')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_by text,
  claim_token text,
  claimed_until timestamptz,
  -- Safe, non-sensitive failure classification only. Vendor responses and
  -- record contents are never persisted here.
  last_failure_category text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (destination, kind, source_id)
);

-- Ready work for a draining worker.
CREATE INDEX IF NOT EXISTS portals_analytics_delivery_ready_idx
  ON portals_analytics_delivery(destination, next_attempt_at)
  WHERE state = 'pending';

-- Operator and reconciliation lookup by source identity.
CREATE INDEX IF NOT EXISTS portals_analytics_delivery_source_idx
  ON portals_analytics_delivery(kind, source_id);

-- Discovery watermark per destination/source kind. `through` is the greatest
-- source insertion time (created_at) fully scanned; discovery re-reads an
-- overlap window before it so transactions that committed late are found.
CREATE TABLE IF NOT EXISTS portals_analytics_discovery (
  destination text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('billing', 'interaction')),
  through timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (destination, kind)
);

-- Idempotent platform-issued credit grants (rewards, courtesy credits).
-- Apply after 001 and 002. Records live in the same database as grants and
-- commit in the same transaction as the grant they create.

-- Reward grants are not purchase-backed: purchase_id stays NULL so refund
-- flows (revokeForPurchase) can never revoke them.
ALTER TABLE monetization_entitlements ALTER COLUMN purchase_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS monetization_credit_grants (
  operation_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  consumer_id text NOT NULL,
  kind text NOT NULL,
  scope jsonb NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  outcome text NOT NULL CHECK (outcome IN ('granted')),
  grant_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

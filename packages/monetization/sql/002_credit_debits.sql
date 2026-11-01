-- Idempotency records live in the same database and transaction as credit debits.
CREATE TABLE IF NOT EXISTS monetization_credit_debits (
  operation_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  consumer_id text NOT NULL,
  kind text NOT NULL,
  scope jsonb NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  outcome text NOT NULL CHECK (outcome IN ('debited', 'insufficient')),
  allocations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

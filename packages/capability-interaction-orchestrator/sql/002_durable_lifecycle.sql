-- Apply after 001 and monetization/sql/001_monetization.sql. No destructive rewrites.
ALTER TABLE input_windows ADD COLUMN IF NOT EXISTS billing_terms jsonb;
ALTER TABLE input_windows ADD COLUMN IF NOT EXISTS admission_sequence integer NOT NULL DEFAULT 0;
UPDATE input_windows w SET admission_sequence = GREATEST(w.admission_sequence,
  COALESCE((SELECT max(admission_sequence) FROM submissions s WHERE s.window_id=w.id),0));
CREATE INDEX IF NOT EXISTS input_windows_close_idx ON input_windows(closes_at) WHERE state='open' AND closes_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS input_windows_active_conflict_idx ON input_windows(world_id,branch_id,conflict_key)
  WHERE state IN ('open','qualifying','resolving','executing','committing');
CREATE UNIQUE INDEX IF NOT EXISTS submissions_admission_idx ON submissions(window_id,admission_sequence);
ALTER TABLE resolutions ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE resolutions ADD COLUMN IF NOT EXISTS request jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE resolutions ADD COLUMN IF NOT EXISTS video_provider_interactions jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS resolutions_idempotency_idx ON resolutions(window_id,idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS resolutions_active_idx ON resolutions(window_id) WHERE status IN ('selected','executing');
ALTER TABLE moderation_decisions ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'input' CHECK (phase IN ('input','output'));
ALTER TABLE interaction_outbox ADD COLUMN IF NOT EXISTS occurred_at timestamptz;
UPDATE interaction_outbox SET occurred_at=created_at WHERE occurred_at IS NULL;
ALTER TABLE interaction_outbox ALTER COLUMN occurred_at SET NOT NULL;
ALTER TABLE interaction_outbox ADD COLUMN IF NOT EXISTS claim_token text;
ALTER TABLE interaction_outbox ADD COLUMN IF NOT EXISTS claimed_until timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS interaction_outbox_sequence_idx ON interaction_outbox(world_id,sequence);
CREATE TABLE IF NOT EXISTS interaction_event_sequences (world_id text PRIMARY KEY, sequence integer NOT NULL CHECK(sequence>0));
INSERT INTO interaction_event_sequences(world_id,sequence) SELECT world_id,max(sequence) FROM interaction_outbox GROUP BY world_id
  ON CONFLICT(world_id) DO UPDATE SET sequence=GREATEST(interaction_event_sequences.sequence,EXCLUDED.sequence);
CREATE TABLE IF NOT EXISTS interaction_reservations (
  id text PRIMARY KEY,
  submission_id text NOT NULL UNIQUE REFERENCES submissions(id),
  state text NOT NULL CHECK(state IN ('reserved','captured','released','refunded')),
  amount_credits integer NOT NULL CHECK(amount_credits>=0),
  allocations jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS interaction_reservations_expiry_idx ON interaction_reservations(expires_at) WHERE state='reserved';
-- Grant ids in allocations intentionally have no FK: purchase revocation deletes grants.
-- Refunds may restore surviving, unexpired grants only; they never recreate a revoked grant.
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_status_check;
ALTER TABLE submissions ADD CONSTRAINT submissions_status_check CHECK(status IN
  ('received','moderating','awaiting_entitlement','eligible','rejected','selected','not_selected','executing','fulfilled','failed','refunded','cancelled'));
-- Registered custom policies use the same durable lifecycle and result validation.
ALTER TABLE input_windows DROP CONSTRAINT IF EXISTS input_windows_arbitration_policy_check;
ALTER TABLE input_windows ADD CONSTRAINT input_windows_arbitration_policy_check CHECK(arbitration_policy ~ '^[a-z][a-z0-9_]{0,63}$');

-- Backend service state. These tables deliberately extend the existing
-- application identity model instead of introducing a second users/tenants
-- schema. Email addresses and invitation tokens are never stored in plaintext.

ALTER TABLE application_users
  ADD COLUMN IF NOT EXISTS cognito_subject text;
CREATE UNIQUE INDEX IF NOT EXISTS application_users_cognito_subject_unique_idx
  ON application_users(cognito_subject) WHERE cognito_subject IS NOT NULL;

CREATE TABLE IF NOT EXISTS invitations (
  id text PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('team_member', 'pilot_room')),
  email_hash text NOT NULL,
  email_ciphertext text NOT NULL,
  customer_account_id text REFERENCES customer_accounts(id) ON DELETE CASCADE,
  pilot_id text REFERENCES lead_pilots(id) ON DELETE CASCADE,
  role text NOT NULL,
  invited_by_user_id text NOT NULL REFERENCES application_users(id) ON DELETE RESTRICT,
  invited_user_id text REFERENCES application_users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  rejected_at timestamptz,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  CHECK (
    (type = 'team_member' AND customer_account_id IS NOT NULL AND pilot_id IS NULL)
    OR
    (type = 'pilot_room' AND pilot_id IS NOT NULL)
  )
);

-- A single live invitation per recipient and target avoids resend races while
-- allowing a later invitation after an explicit rejection or expiry.
CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_target_unique_idx
  ON invitations(type, email_hash, COALESCE(customer_account_id, ''), COALESCE(pilot_id, ''))
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS invitations_customer_pending_idx
  ON invitations(customer_account_id, created_at DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS invitations_pilot_pending_idx
  ON invitations(pilot_id, created_at DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS invitations_expiry_idx
  ON invitations(status, expires_at);

CREATE TABLE IF NOT EXISTS invitation_tokens (
  id text PRIMARY KEY,
  invitation_id text NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invitation_tokens_invitation_idx
  ON invitation_tokens(invitation_id, expires_at);

-- New backend lead intake is kept separate from the legacy Vercel outbox while
-- the frontend is migrated endpoint by endpoint. The service encrypts payloads
-- before persistence and writes a durable CRM work item in the same transaction.
CREATE TABLE IF NOT EXISTS backend_lead_submissions (
  id text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  email_hash text NOT NULL,
  payload_ciphertext text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz
);
CREATE INDEX IF NOT EXISTS backend_lead_submissions_status_idx
  ON backend_lead_submissions(status, created_at);

CREATE TABLE IF NOT EXISTS backend_lead_outbox (
  id bigserial PRIMARY KEY,
  submission_id text NOT NULL REFERENCES backend_lead_submissions(id) ON DELETE CASCADE,
  action_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'retry', 'complete', 'dead')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS backend_lead_outbox_due_idx
  ON backend_lead_outbox(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS backend_crm_webhooks (
  id bigserial PRIMARY KEY,
  event_id text,
  payload_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS backend_crm_webhooks_event_unique_idx
  ON backend_crm_webhooks(event_id) WHERE event_id IS NOT NULL;

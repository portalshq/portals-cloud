-- Application-owned identity, customer tenancy, and CRM projection state.
-- Apollo IDs are external references only; customer, payment, consent, and audit
-- data remain in this database.

CREATE TABLE IF NOT EXISTS application_users (
  id text PRIMARY KEY,
  profile_id text UNIQUE REFERENCES lead_profiles(id) ON DELETE SET NULL,
  email_hash text NOT NULL UNIQUE,
  identity_ciphertext text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_accounts (
  id text PRIMARY KEY,
  name text NOT NULL,
  domain text,
  stripe_customer_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_accounts_domain_unique_idx
  ON customer_accounts(domain) WHERE domain IS NOT NULL;

CREATE TABLE IF NOT EXISTS customer_memberships (
  customer_account_id text NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES application_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY(customer_account_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_accounts_one_owner_idx
  ON customer_memberships(customer_account_id)
  WHERE role = 'owner' AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS pilot_memberships (
  pilot_id text NOT NULL REFERENCES lead_pilots(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES application_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'participant', 'approver', 'signer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY(pilot_id, user_id)
);

CREATE TABLE IF NOT EXISTS auth_magic_links (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES application_users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('sign_in', 'invite')),
  customer_account_id text REFERENCES customer_accounts(id) ON DELETE CASCADE,
  role text CHECK (role IN ('owner', 'admin', 'member')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_magic_links_user_expiry_idx
  ON auth_magic_links(user_id, expires_at);

CREATE TABLE IF NOT EXISTS application_sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES application_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS application_sessions_user_expiry_idx
  ON application_sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS application_audit_events (
  id bigserial PRIMARY KEY,
  customer_account_id text REFERENCES customer_accounts(id) ON DELETE SET NULL,
  pilot_id text REFERENCES lead_pilots(id) ON DELETE SET NULL,
  actor_user_id text REFERENCES application_users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lead_pilots
  ADD COLUMN IF NOT EXISTS customer_account_id text REFERENCES customer_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS lead_pilots_customer_account_idx
  ON lead_pilots(customer_account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_external_records (
  source_type text NOT NULL CHECK (source_type IN ('lead_profile', 'customer_account', 'pilot')),
  source_id text NOT NULL,
  remote_type text NOT NULL CHECK (remote_type IN ('contact', 'account', 'deal')),
  remote_id text NOT NULL,
  remote_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(source_type, source_id, remote_type),
  UNIQUE(remote_type, remote_id)
);

CREATE TABLE IF NOT EXISTS crm_outbox (
  id bigserial PRIMARY KEY,
  source_type text NOT NULL CHECK (source_type IN ('lead_profile', 'customer_account', 'pilot')),
  source_id text NOT NULL,
  event_type text NOT NULL,
  event_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'retry', 'processing', 'complete', 'dead')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS crm_outbox_due_idx ON crm_outbox(status, next_attempt_at);

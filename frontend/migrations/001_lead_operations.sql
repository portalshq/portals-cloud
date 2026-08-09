CREATE TABLE IF NOT EXISTS lead_profiles (
  id text PRIMARY KEY,
  email_hash text UNIQUE,
  identity_ciphertext text NOT NULL,
  identity_verified boolean NOT NULL DEFAULT false,
  analytics_person_id text NOT NULL UNIQUE,
  company_domain text,
  first_touch jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_touch jsonb NOT NULL DEFAULT '{}'::jsonb,
  marketing_consent boolean NOT NULL DEFAULT false,
  marketing_suppressed boolean NOT NULL DEFAULT false,
  analytics_consent boolean NOT NULL DEFAULT false,
  consent_version text,
  consent_source text,
  consent_recorded_at timestamptz,
  consent_withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lead_profiles
  ADD COLUMN IF NOT EXISTS analytics_consent boolean NOT NULL DEFAULT false;
ALTER TABLE lead_profiles
  ADD COLUMN IF NOT EXISTS marketing_suppressed boolean NOT NULL DEFAULT false;
ALTER TABLE lead_profiles
  ADD COLUMN IF NOT EXISTS consent_source text;

CREATE TABLE IF NOT EXISTS lead_profile_tokens (
  token_hash text PRIMARY KEY,
  profile_id text NOT NULL REFERENCES lead_profiles(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_profile_tokens_profile_idx
  ON lead_profile_tokens(profile_id);

CREATE TABLE IF NOT EXISTS lead_submissions (
  id text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  submission_type text NOT NULL,
  provider text NOT NULL,
  form_version text NOT NULL,
  profile_id text REFERENCES lead_profiles(id) ON DELETE SET NULL,
  company_domain text,
  payload_ciphertext text NOT NULL,
  scores jsonb,
  qualification_tier text,
  recommended_workflow text,
  qualifying_submission_id text,
  verified boolean NOT NULL DEFAULT false,
  process_status text NOT NULL DEFAULT 'pending',
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  synced_at timestamptz,
  payload_delete_after timestamptz
);

CREATE INDEX IF NOT EXISTS lead_submissions_profile_created_idx
  ON lead_submissions(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_submissions_status_idx
  ON lead_submissions(process_status, created_at);

CREATE TABLE IF NOT EXISTS lead_outbox (
  id bigserial PRIMARY KEY,
  submission_id text NOT NULL REFERENCES lead_submissions(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  action_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS lead_outbox_due_idx
  ON lead_outbox(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS lead_rate_limits (
  rate_key text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(rate_key, window_start)
);

CREATE INDEX IF NOT EXISTS lead_rate_limits_expiry_idx
  ON lead_rate_limits(expires_at);

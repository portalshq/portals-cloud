-- Productized pilot purchasing metadata and immutable terms evidence.
ALTER TABLE lead_pilots
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'standard'
    CHECK (mode IN ('standard', 'assisted'));

CREATE TABLE IF NOT EXISTS pilot_terms_acceptances (
  id text PRIMARY KEY,
  pilot_id text NOT NULL REFERENCES lead_pilots(id) ON DELETE CASCADE,
  actor_user_id text REFERENCES application_users(id) ON DELETE SET NULL,
  actor_email text NOT NULL,
  actor_name text,
  customer_account_id text REFERENCES customer_accounts(id) ON DELETE SET NULL,
  company_legal_name text,
  authority_represented boolean NOT NULL,
  terms_document_id text NOT NULL,
  terms_version text NOT NULL,
  terms_effective_date date,
  terms_hash text NOT NULL,
  terms_snapshot jsonb NOT NULL,
  acceptance_text_version text NOT NULL,
  acceptance_text_hash text NOT NULL,
  acceptance_method text NOT NULL,
  affirmative_action text NOT NULL,
  accepted_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  session_id text,
  pilot_scope_version text NOT NULL,
  pilot_scope_hash text NOT NULL,
  amount bigint NOT NULL,
  currency text NOT NULL,
  payment_method text NOT NULL,
  annual_credit_terms_version text,
  material_exceptions_pending boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pilot_id, terms_hash, pilot_scope_hash)
);

CREATE INDEX IF NOT EXISTS pilot_terms_acceptances_pilot_idx
  ON pilot_terms_acceptances(pilot_id, accepted_at DESC);

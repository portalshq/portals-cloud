-- Up Migration
-- New subscriptions are separate from the legacy calendar-invite signups.
-- Existing records are deliberately not converted into recurring email consent.
CREATE TABLE notification_recipients (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email text NOT NULL,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  timezone text NOT NULL,
  verified_at timestamptz,
  general_schedule_enabled boolean NOT NULL DEFAULT false,
  general_schedule_consent_at timestamptz,
  suppressed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX notification_recipients_email ON notification_recipients (lower(email));
CREATE UNIQUE INDEX notification_recipients_user ON notification_recipients (user_id) WHERE user_id IS NOT NULL;

CREATE TABLE program_email_subscriptions (
  recipient_id text NOT NULL REFERENCES notification_recipients(id) ON DELETE CASCADE,
  program_id text NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  episode_enabled boolean NOT NULL DEFAULT false,
  weekly_enabled boolean NOT NULL DEFAULT false,
  consent_at timestamptz NOT NULL,
  consent_source text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recipient_id, program_id)
);

-- Delivery ledger protects against repeat sends across worker instances and retries.
CREATE TABLE notification_deliveries (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  recipient_id text NOT NULL REFERENCES notification_recipients(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('episode', 'followed_weekly', 'general_weekly', 'confirmation')),
  occurrence_key text NOT NULL,
  program_id text REFERENCES programs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'cancelled', 'failed')),
  lease_until timestamptz,
  lease_token text,
  first_attempt_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  payload jsonb,
  last_error text,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (recipient_id, kind, occurrence_key)
);

-- Tokens are stored as hashes; linking a mailbox to an account requires proof
-- of mailbox control and never relies on an unverified profile email.
CREATE TABLE notification_email_verifications (
  token_hash text PRIMARY KEY,
  email text NOT NULL,
  user_id text REFERENCES users(id) ON DELETE CASCADE,
  intent jsonb,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_rate_limits (
  key text PRIMARY KEY,
  requests integer NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE notification_crm_outbox (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  recipient_id text NOT NULL REFERENCES notification_recipients(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token text,
  lease_until timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

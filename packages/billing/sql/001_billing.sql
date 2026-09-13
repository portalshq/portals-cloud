CREATE TABLE IF NOT EXISTS billing_channel_profiles (
  channel_id text PRIMARY KEY,
  owner_id text NOT NULL,
  stripe_customer_id text NOT NULL UNIQUE,
  stripe_connected_account_id text NOT NULL,
  onboarding_complete boolean NOT NULL DEFAULT false,
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  default_currency text NOT NULL,
  country text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS billing_channel_profiles_connect_idx ON billing_channel_profiles(stripe_connected_account_id);

CREATE TABLE IF NOT EXISTS billing_channel_purchases (
  id text PRIMARY KEY,
  channel_id text NOT NULL REFERENCES billing_channel_profiles(channel_id),
  buyer_id text NOT NULL,
  buyer_stripe_customer_id text,
  product_key text NOT NULL,
  kind text NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  platform_fee_amount bigint NOT NULL CHECK (platform_fee_amount >= 0 AND platform_fee_amount <= amount),
  state text NOT NULL,
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  stripe_charge_id text UNIQUE,
  stripe_transfer_id text,
  stripe_application_fee_id text,
  refunded_amount bigint NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0 AND refunded_amount <= amount),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_stripe_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  created_at timestamptz NOT NULL,
  processed_at timestamptz
);

CREATE TABLE IF NOT EXISTS billing_ledger (
  id text PRIMARY KEY,
  purchase_id text NOT NULL REFERENCES billing_channel_purchases(id),
  stripe_event_id text REFERENCES billing_stripe_events(id),
  kind text NOT NULL,
  amount bigint NOT NULL,
  currency text NOT NULL,
  stripe_fee bigint,
  net bigint,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  UNIQUE (stripe_event_id, kind, purchase_id)
);

CREATE TABLE IF NOT EXISTS billing_outbox (
  id text PRIMARY KEY,
  type text NOT NULL,
  aggregate_id text NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS billing_outbox_pending_idx ON billing_outbox(created_at) WHERE delivered_at IS NULL;

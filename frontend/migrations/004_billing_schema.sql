-- Billing schema for Stripe integration
-- Tables are prefixed with billing_ to separate from marketing lead_ tables
-- Schema designed for future migration to cloud application server

-- Stripe Customer records
CREATE TABLE IF NOT EXISTS billing_customers (
  id text PRIMARY KEY, -- Stripe Customer ID
  email text,
  name text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, -- Extensible for future fields
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Subscription records
CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id text PRIMARY KEY, -- Stripe Subscription ID
  customer_id text NOT NULL REFERENCES billing_customers(id) ON DELETE CASCADE,
  product_type text NOT NULL CHECK (product_type IN ('production-team', 'studio')), -- Extensible for future products
  status text NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'incomplete', 'incomplete_expired', 'unpaid')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, -- Extensible for metering, features, etc.
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_subscriptions_customer_idx ON billing_subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS billing_subscriptions_status_idx ON billing_subscriptions(status);

-- Invoice records
CREATE TABLE IF NOT EXISTS billing_invoices (
  id text PRIMARY KEY, -- Stripe Invoice ID
  subscription_id text REFERENCES billing_subscriptions(id) ON DELETE SET NULL,
  customer_id text NOT NULL REFERENCES billing_customers(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
  amount integer NOT NULL, -- Amount in cents
  currency text NOT NULL,
  due_date timestamptz,
  paid_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, -- Extensible for future billing data
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_invoices_subscription_idx ON billing_invoices(subscription_id);
CREATE INDEX IF NOT EXISTS billing_invoices_customer_idx ON billing_invoices(customer_id);
CREATE INDEX IF NOT EXISTS billing_invoices_status_idx ON billing_invoices(status);

-- Payment intent records
CREATE TABLE IF NOT EXISTS billing_payments (
  id text PRIMARY KEY, -- Stripe Payment Intent ID
  invoice_id text REFERENCES billing_invoices(id) ON DELETE SET NULL,
  customer_id text NOT NULL REFERENCES billing_customers(id) ON DELETE CASCADE,
  amount integer NOT NULL, -- Amount in cents
  currency text NOT NULL,
  status text NOT NULL,
  product_type text CHECK (product_type IN ('production-pilot', 'studio-pilot', 'onboarding')), -- Extensible
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, -- Extensible for future payment data
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_payments_invoice_idx ON billing_payments(invoice_id);
CREATE INDEX IF NOT EXISTS billing_payments_customer_idx ON billing_payments(customer_id);
CREATE INDEX IF NOT EXISTS billing_payments_status_idx ON billing_payments(status);

-- Checkout session records
CREATE TABLE IF NOT EXISTS billing_checkout_sessions (
  id text PRIMARY KEY, -- Stripe Session ID
  customer_id text REFERENCES billing_customers(id) ON DELETE SET NULL,
  payment_intent_id text REFERENCES billing_payments(id) ON DELETE SET NULL,
  product_type text NOT NULL CHECK (product_type IN ('production-pilot', 'production-team', 'studio-pilot', 'studio', 'onboarding')), -- Extensible
  status text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, -- Extensible
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_checkout_sessions_customer_idx ON billing_checkout_sessions(customer_id);
CREATE INDEX IF NOT EXISTS billing_checkout_sessions_payment_idx ON billing_checkout_sessions(payment_intent_id);
CREATE INDEX IF NOT EXISTS billing_checkout_sessions_status_idx ON billing_checkout_sessions(status);

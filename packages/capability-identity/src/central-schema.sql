-- Compatibility copy. Canonical version: sql/001_central_identity.sql.
-- Central database schema for cross-app identity
-- This schema is for the central Portals database that stores user data
-- shared across all applications.

-- User registry (all apps)
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,  -- auth-gateway subject_id
  display_name text NOT NULL,
  email text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  preferred_username text,
  idp text,  -- auth-gateway issuer
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- User preferences (all apps)
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- Channel registry (all apps)
CREATE TABLE IF NOT EXISTS channel_apps (
  id text PRIMARY KEY,  -- App ID
  name text NOT NULL,
  tenant_id text NOT NULL,  -- For cross-app analytics
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Channel schedules (all apps)
CREATE TABLE IF NOT EXISTS channel_schedules (
  id text PRIMARY KEY,
  app_id text NOT NULL REFERENCES channel_apps(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  schedule jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Channel sessions (all apps)
CREATE TABLE IF NOT EXISTS channel_sessions (
  id text PRIMARY KEY,
  app_id text NOT NULL REFERENCES channel_apps(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Cross-app user history (for analytics)
CREATE TABLE IF NOT EXISTS user_channel_history (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id text REFERENCES channel_apps(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  session_id text NOT NULL,
  last_interaction_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb,
  UNIQUE (user_id, channel_id, session_id)
);

CREATE INDEX IF NOT EXISTS user_channel_history_user_idx ON user_channel_history(user_id);
CREATE INDEX IF NOT EXISTS user_channel_history_app_idx ON user_channel_history(app_id);

-- Upgrade the previously distributed schema without deleting historical data.
ALTER TABLE users ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'suspended'));
ALTER TABLE users ALTER COLUMN idp DROP NOT NULL;
ALTER TABLE user_channel_history ALTER COLUMN app_id DROP NOT NULL;
-- Duplicate legacy soft keys must be reconciled by an operator before upgrading.
-- A unique-index failure rolls back the entire migration; history is never discarded.
CREATE UNIQUE INDEX IF NOT EXISTS user_channel_history_soft_key_idx
  ON user_channel_history(user_id, channel_id, session_id);
CREATE INDEX IF NOT EXISTS user_channel_history_recent_idx
  ON user_channel_history(user_id, last_interaction_at DESC);

ALTER TABLE user_channel_history ALTER COLUMN session_id SET NOT NULL;
DO $history_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'user_channel_history'::regclass AND conname = 'identity_history_channel_length') THEN
    ALTER TABLE user_channel_history ADD CONSTRAINT identity_history_channel_length
      CHECK (length(btrim(channel_id)) BETWEEN 1 AND 128);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'user_channel_history'::regclass AND conname = 'identity_history_session_length') THEN
    ALTER TABLE user_channel_history ADD CONSTRAINT identity_history_session_length
      CHECK (length(btrim(session_id)) BETWEEN 1 AND 128);
  END IF;
END $history_constraints$;

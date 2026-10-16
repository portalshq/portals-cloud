-- Central database schema for cross-app identity
-- This schema is for the central Portals database that stores user data
-- shared across all applications.

-- User registry (all apps)
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,  -- auth-gateway subject_id
  display_name text NOT NULL,
  email text,
  preferred_username text,
  idp text NOT NULL,  -- auth-gateway issuer
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
  app_id text NOT NULL REFERENCES channel_apps(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  session_id text,
  last_interaction_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb,
  UNIQUE (user_id, app_id, channel_id, session_id)
);

CREATE INDEX IF NOT EXISTS user_channel_history_user_idx ON user_channel_history(user_id);
CREATE INDEX IF NOT EXISTS user_channel_history_app_idx ON user_channel_history(app_id);

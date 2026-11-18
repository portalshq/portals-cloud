-- Scoped Channels admin tokens and per-app production-control credentials.
--
-- The Channels admin API (/api/admin/*) accepts either the platform superuser
-- token (CHANNELS_ADMIN_TOKEN, env — all channels) or a scoped token row here.
-- `token_hash` is sha256(token) hex, so lookups never store the bearer token
-- itself. `channel_ids` lists the channel slugs the token may view and mutate;
-- an empty array leaves the token with no channels (a soft revoke that keeps
-- the row auditable — use `revoked_at` for explicit revocation).
CREATE TABLE IF NOT EXISTS channel_admin_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  channel_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

-- Server-side bearer forwarded to a registered channel app's
-- POST /api/production/{start|stop|test-closing}. Keyed by channel slug; the
-- app's origin comes from programs.app_origin on the bound program row. This
-- is the database-driven replacement for per-app env tokens (the bears
-- BEARS_PRODUCTION_CONTROL_TOKEN env remains as a fallback for that channel).
CREATE TABLE IF NOT EXISTS channel_app_control_tokens (
  channel_id text PRIMARY KEY,
  control_token text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

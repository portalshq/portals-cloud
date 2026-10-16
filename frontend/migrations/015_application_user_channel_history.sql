-- Cross-channel history belongs to the application identity database.
-- Channel and session IDs are soft references because their records may live
-- in creator-owned databases; user_id stays a hard local foreign key.
-- Interaction time is the transaction clock (now()), never caller-supplied.
-- The 128-character identifier bounds mirror MAX_IDENTIFIER_LENGTH in
-- @portalshq/capability-identity and keep the primary key within B-tree limits.
CREATE TABLE IF NOT EXISTS application_user_channel_history (
  user_id text NOT NULL REFERENCES application_users(id) ON DELETE CASCADE,
  channel_id text NOT NULL CHECK (length(channel_id) BETWEEN 1 AND 128),
  session_id text NOT NULL CHECK (length(session_id) BETWEEN 1 AND 128),
  last_interaction_at timestamptz NOT NULL,
  PRIMARY KEY(user_id, channel_id, session_id)
);

CREATE INDEX IF NOT EXISTS application_user_channel_history_recent_idx
  ON application_user_channel_history(user_id, last_interaction_at DESC);

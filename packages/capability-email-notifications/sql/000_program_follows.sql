-- Up Migration
-- App follows are independent of email notification subscriptions.
CREATE TABLE IF NOT EXISTS program_follows (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id text NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, program_id)
);

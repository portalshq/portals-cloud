-- A person can fulfill more than one pilot-room responsibility. The former
-- primary key allowed one membership role per pilot/user pair and caused later
-- invitations to overwrite an existing, potentially more privileged role.
ALTER TABLE pilot_memberships DROP CONSTRAINT IF EXISTS pilot_memberships_pkey;

ALTER TABLE pilot_memberships
  ADD CONSTRAINT pilot_memberships_pkey PRIMARY KEY (pilot_id, user_id, role);

-- Durable deduplication is scoped to the actual recipient and the event that
-- generated the message. A recipient may still receive different event types.
CREATE TABLE IF NOT EXISTS email_deduplication (
  id bigserial PRIMARY KEY,
  pilot_id text NOT NULL REFERENCES lead_pilots(id) ON DELETE CASCADE,
  recipient_key text NOT NULL,
  event_type text NOT NULL,
  event_key text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'sent' CHECK (delivery_status IN ('sending', 'sent')),
  claim_token text,
  claim_expires_at timestamptz,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pilot_id, recipient_key, event_type, event_key)
);

CREATE INDEX IF NOT EXISTS email_deduplication_pilot_sent_at_idx
  ON email_deduplication (pilot_id, sent_at DESC);

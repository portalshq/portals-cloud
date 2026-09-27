CREATE TABLE IF NOT EXISTS auth_audit_events (
  id bigserial PRIMARY KEY,
  event_type text NOT NULL,
  subject_id text,
  idp text,
  outcome text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_audit_events_subject_idx
  ON auth_audit_events(subject_id, created_at DESC);

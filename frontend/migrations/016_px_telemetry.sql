CREATE TABLE IF NOT EXISTS px_telemetry_events (
  event_type text NOT NULL CHECK (event_type IN ('download', 'install')),
  anonymous_id char(32) NOT NULL CHECK (anonymous_id ~ '^[0-9a-f]{32}$'),
  download_id char(32) CHECK (download_id IS NULL OR download_id ~ '^[0-9a-f]{32}$'),
  version varchar(80),
  platform varchar(80),
  utm_source varchar(160),
  utm_medium varchar(160),
  utm_campaign varchar(160),
  utm_content varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_type, anonymous_id)
);

CREATE INDEX IF NOT EXISTS px_telemetry_events_type_created_idx
  ON px_telemetry_events(event_type, created_at DESC);

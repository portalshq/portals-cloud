-- Pilot approval room: reviewer coordination, version freeze, team review phase
ALTER TABLE lead_pilots
  ADD COLUMN IF NOT EXISTS reviewers jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE lead_pilots
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

ALTER TABLE lead_pilots
  ADD COLUMN IF NOT EXISTS draft jsonb;

ALTER TABLE lead_pilots
  ADD COLUMN IF NOT EXISTS revisions jsonb NOT NULL DEFAULT '[]'::jsonb;

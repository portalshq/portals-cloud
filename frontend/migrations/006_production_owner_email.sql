-- Add production_owner_email to lead_pilots table
-- The production owner email is stored in the answers_ciphertext JSON field,
-- but we also add a direct column for easier querying and CRM integration

ALTER TABLE lead_pilots
ADD COLUMN IF NOT EXISTS production_owner_email text;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS lead_pilots_production_owner_email_idx
ON lead_pilots(production_owner_email);

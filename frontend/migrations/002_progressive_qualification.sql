ALTER TABLE lead_profiles
  ADD COLUMN IF NOT EXISTS qualification_ciphertext text;
ALTER TABLE lead_profiles
  ADD COLUMN IF NOT EXISTS qualification_scores jsonb;
ALTER TABLE lead_profiles
  ADD COLUMN IF NOT EXISTS qualification_tier text;
ALTER TABLE lead_profiles
  ADD COLUMN IF NOT EXISTS qualification_workflow text;
ALTER TABLE lead_profiles
  ADD COLUMN IF NOT EXISTS qualification_updated_at timestamptz;

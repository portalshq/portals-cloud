CREATE TABLE IF NOT EXISTS lead_pilots (
  id text PRIMARY KEY,
  profile_id text NOT NULL REFERENCES lead_profiles(id) ON DELETE CASCADE,
  initial_submission_id text,
  state text NOT NULL DEFAULT 'reviewing',
  route text NOT NULL DEFAULT 'zero-call',
  answers_ciphertext text NOT NULL,
  exceptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  unresolved jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposal jsonb NOT NULL DEFAULT '{}'::jsonb,
  success_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  security_decisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  signing jsonb NOT NULL DEFAULT '{}'::jsonb,
  payment jsonb NOT NULL DEFAULT '{}'::jsonb,
  kickoff jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_start_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lead_submissions
  ADD COLUMN IF NOT EXISTS pilot_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lead_pilots_initial_submission_fk'
      AND conrelid = 'lead_pilots'::regclass
  ) THEN
    ALTER TABLE lead_pilots
      ADD CONSTRAINT lead_pilots_initial_submission_fk
        FOREIGN KEY (initial_submission_id) REFERENCES lead_submissions(id)
        ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lead_submissions_pilot_fk'
      AND conrelid = 'lead_submissions'::regclass
  ) THEN
    ALTER TABLE lead_submissions
      ADD CONSTRAINT lead_submissions_pilot_fk
        FOREIGN KEY (pilot_id) REFERENCES lead_pilots(id)
        ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS lead_pilots_profile_idx
  ON lead_pilots(profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS lead_pilots_state_idx
  ON lead_pilots(state, route);

CREATE INDEX IF NOT EXISTS lead_submissions_pilot_idx
  ON lead_submissions(pilot_id);

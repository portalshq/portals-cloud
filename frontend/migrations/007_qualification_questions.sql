-- Add new qualification questions to lead_submissions table
-- These fields are part of the common schema and are stored at the request level

ALTER TABLE lead_submissions
ADD COLUMN IF NOT EXISTS what_brought_you_here text;

ALTER TABLE lead_submissions
ADD COLUMN IF NOT EXISTS what_brought_you_here_other text;

ALTER TABLE lead_submissions
ADD COLUMN IF NOT EXISTS how_did_you_hear_about_portals text;

-- Indexes for filtering and analytics
CREATE INDEX IF NOT EXISTS lead_submissions_what_brought_you_here_idx
ON lead_submissions(what_brought_you_here);

CREATE INDEX IF NOT EXISTS lead_submissions_how_did_you_hear_about_portals_idx
ON lead_submissions(how_did_you_hear_about_portals);

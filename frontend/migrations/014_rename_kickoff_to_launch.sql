-- Rename kickoff column to launch for pilot state/field terminology consistency
ALTER TABLE lead_pilots RENAME COLUMN kickoff TO launch;

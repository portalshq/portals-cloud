-- Drafts contain the same contact and commercial data as committed pilot terms.
-- Keep the JSON column only for non-sensitive synchronization metadata while the
-- full Automerge document is encrypted at rest.
ALTER TABLE lead_pilots
  ADD COLUMN IF NOT EXISTS draft_ciphertext text;

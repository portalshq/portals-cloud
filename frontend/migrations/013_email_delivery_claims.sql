-- Upgrade deployments that applied the first dual-role migration before
-- delivery claims were introduced. A claim is written before contacting the
-- provider, then completed only after a successful send.
ALTER TABLE email_deduplication
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'sent'
    CHECK (delivery_status IN ('sending', 'sent')),
  ADD COLUMN IF NOT EXISTS claim_token text,
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS email_deduplication_claim_expiry_idx
  ON email_deduplication (claim_expires_at)
  WHERE delivery_status = 'sending';

-- Rotating refresh sessions for the Auth Gateway.
-- Each browser login creates a family; each refresh atomically rotates one credential.
-- Reuse of a consumed token revokes the entire family (replay detection).

CREATE TABLE IF NOT EXISTS auth_refresh_sessions (
    token_hash BYTEA PRIMARY KEY,
    family_id UUID NOT NULL,
    subject_type VARCHAR(32) NOT NULL,
    subject_id VARCHAR(128) NOT NULL,
    display_name VARCHAR(256) NOT NULL,
    preferred_username VARCHAR(256) NOT NULL,
    idp VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    rotated_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    replaced_by BYTEA,
    CONSTRAINT refresh_subject_type CHECK (subject_type IN ('user', 'service_account')),
    CONSTRAINT refresh_no_wildcard CHECK (subject_id NOT LIKE '%*%' AND length(subject_id) > 0)
);
CREATE INDEX IF NOT EXISTS idx_refresh_family ON auth_refresh_sessions (family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_subject ON auth_refresh_sessions (subject_type, subject_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_expiry ON auth_refresh_sessions (expires_at) WHERE revoked_at IS NULL AND rotated_at IS NULL;

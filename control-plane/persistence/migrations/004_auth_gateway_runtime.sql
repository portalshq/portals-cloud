-- Forward-compatible upgrade for databases that ran migration 003 before the
-- Auth Gateway runtime was introduced. All statements are restart-safe.
CREATE UNIQUE INDEX IF NOT EXISTS idx_relationship_single_role
    ON resource_relationships (resource_type,resource_id,subject_type,subject_id);
ALTER TABLE service_account_api_keys ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ;
ALTER TABLE service_account_api_keys DROP CONSTRAINT IF EXISTS api_key_overlap;
ALTER TABLE service_account_api_keys ADD CONSTRAINT api_key_overlap CHECK (
    (rotated_at IS NULL AND overlap_until IS NULL) OR
    (rotated_at IS NOT NULL AND overlap_until IS NOT NULL AND
     overlap_until <= rotated_at + INTERVAL '24 hours')
);

CREATE TABLE IF NOT EXISTS auth_gateway_sessions (
    session_code UUID PRIMARY KEY, client_state UUID NOT NULL,
    oauth_state UUID NOT NULL UNIQUE, pkce_verifier VARCHAR(128) NOT NULL,
    oidc_nonce UUID NOT NULL, subject_id VARCHAR(128), display_name VARCHAR(256),
    preferred_username VARCHAR(256), expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ, consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_gateway_sessions_expiry
    ON auth_gateway_sessions (expires_at) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_principals (
    subject_type VARCHAR(32) NOT NULL, subject_id VARCHAR(128) NOT NULL,
    display_name VARCHAR(256) NOT NULL, preferred_username VARCHAR(256) NOT NULL,
    disabled_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (subject_type, subject_id),
    CONSTRAINT principal_type CHECK (subject_type IN ('user', 'service_account')),
    CONSTRAINT principal_no_wildcard CHECK (subject_id NOT LIKE '%*%' AND length(subject_id) > 0)
);
ALTER TABLE auth_principals ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS api_key_exchange_rate_limits (
    key_id UUID NOT NULL, window_start TIMESTAMPTZ NOT NULL,
    attempts INT NOT NULL DEFAULT 1, PRIMARY KEY (key_id, window_start)
);
CREATE TABLE IF NOT EXISTS repository_deletion_reconciliation (
    repository_id VARCHAR(128) PRIMARY KEY, requested_by VARCHAR(128) NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), confirmed_at TIMESTAMPTZ,
    last_error TEXT,
    CONSTRAINT deletion_reconciliation_no_wildcard CHECK (repository_id NOT LIKE '%*%' AND requested_by NOT LIKE '%*%')
);

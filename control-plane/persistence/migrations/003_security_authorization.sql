-- Repository-scoped ReBAC and service-account credentials.

CREATE TABLE IF NOT EXISTS resource_relationships (
    resource_type VARCHAR(32) NOT NULL,
    resource_id VARCHAR(128) NOT NULL,
    subject_type VARCHAR(32) NOT NULL,
    subject_id VARCHAR(128) NOT NULL,
    relation VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (resource_type, resource_id, subject_type, subject_id),
    CONSTRAINT repository_relationship_only CHECK (resource_type = 'repository'),
    CONSTRAINT relationship_role CHECK (relation IN ('owner', 'collaborator')),
    CONSTRAINT relationship_no_wildcard CHECK (
        resource_id NOT LIKE '%*%' AND subject_id NOT LIKE '%*%'
        AND length(resource_id) > 0 AND length(subject_id) > 0
    )
);

CREATE INDEX IF NOT EXISTS idx_relationship_subject
    ON resource_relationships (subject_type, subject_id, relation, resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_relationship_resource
    ON resource_relationships (resource_type, resource_id, relation, subject_type, subject_id);

CREATE TABLE IF NOT EXISTS service_account_api_keys (
    key_id UUID PRIMARY KEY,
    service_account_id VARCHAR(128) NOT NULL,
    secret_hmac BYTEA NOT NULL,
    pepper_version VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    rotation_family UUID NOT NULL,
    rotated_at TIMESTAMPTZ,
    overlap_until TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    CONSTRAINT api_key_lifetime CHECK (expires_at <= created_at + INTERVAL '90 days'),
    CONSTRAINT api_key_overlap CHECK (
        (rotated_at IS NULL AND overlap_until IS NULL) OR
        (rotated_at IS NOT NULL AND overlap_until IS NOT NULL AND
         overlap_until <= rotated_at + INTERVAL '24 hours')
    )
);

CREATE INDEX IF NOT EXISTS idx_api_key_service_account
    ON service_account_api_keys (service_account_id, expires_at)
    WHERE revoked_at IS NULL;

-- Tracks idempotent multi-step repository/relationship provisioning so the
-- reconciler can complete partial operations or identify orphaned resources.
CREATE TABLE IF NOT EXISTS repository_security_reconciliation (
    operation_id UUID PRIMARY KEY,
    repository_id VARCHAR(128) NOT NULL,
    owner_subject_id VARCHAR(128) NOT NULL,
    repository_created BOOLEAN NOT NULL DEFAULT FALSE,
    owner_relationship_created BOOLEAN NOT NULL DEFAULT FALSE,
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (repository_id, owner_subject_id),
    CONSTRAINT reconciliation_no_wildcard CHECK (
        repository_id NOT LIKE '%*%' AND owner_subject_id NOT LIKE '%*%'
    )
);

CREATE INDEX IF NOT EXISTS idx_repository_security_incomplete
    ON repository_security_reconciliation (updated_at)
    WHERE NOT (repository_created AND owner_relationship_created);

CREATE TABLE IF NOT EXISTS repository_deletion_reconciliation (
    repository_id VARCHAR(128) PRIMARY KEY,
    requested_by VARCHAR(128) NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    last_error TEXT,
    CONSTRAINT deletion_reconciliation_no_wildcard CHECK (
        repository_id NOT LIKE '%*%' AND requested_by NOT LIKE '%*%'
    )
);

CREATE TABLE IF NOT EXISTS auth_gateway_sessions (
    session_code UUID PRIMARY KEY,
    client_state UUID NOT NULL,
    oauth_state UUID NOT NULL UNIQUE,
    pkce_verifier VARCHAR(128) NOT NULL,
    oidc_nonce UUID NOT NULL,
    subject_id VARCHAR(128),
    display_name VARCHAR(256),
    preferred_username VARCHAR(256),
    expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_gateway_sessions_expiry
    ON auth_gateway_sessions (expires_at) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_principals (
    subject_type VARCHAR(32) NOT NULL,
    subject_id VARCHAR(128) NOT NULL,
    display_name VARCHAR(256) NOT NULL,
    preferred_username VARCHAR(256) NOT NULL,
    disabled_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (subject_type, subject_id),
    CONSTRAINT principal_type CHECK (subject_type IN ('user', 'service_account')),
    CONSTRAINT principal_no_wildcard CHECK (subject_id NOT LIKE '%*%' AND length(subject_id) > 0)
);

CREATE TABLE IF NOT EXISTS api_key_exchange_rate_limits (
    key_id UUID NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    attempts INT NOT NULL DEFAULT 1,
    PRIMARY KEY (key_id, window_start)
);

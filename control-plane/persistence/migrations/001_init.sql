-- Lore Cloud Control Plane: Core Schema
-- resources: The desired/observed state table with optimistic concurrency
-- outbox_events: Transactional outbox for at-least-once event delivery
-- workflow_steps: Step Functions-style workflow state tracking

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Core resource table with optimistic concurrency (CAS token)
-- ============================================================
CREATE TABLE IF NOT EXISTS resources (
    kind VARCHAR(64) NOT NULL,
    id VARCHAR(128) NOT NULL,
    version BIGINT NOT NULL DEFAULT 1,
    spec JSONB NOT NULL DEFAULT '{}',
    status JSONB NOT NULL DEFAULT '{}',
    handle JSONB DEFAULT NULL,
    finalizers TEXT[] DEFAULT '{}',
    deletion_requested BOOLEAN DEFAULT FALSE,
    workflow_id VARCHAR(256) DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (kind, id)
);

CREATE INDEX IF NOT EXISTS idx_resources_kind ON resources(kind);
CREATE INDEX IF NOT EXISTS idx_resources_deletion ON resources(deletion_requested) WHERE deletion_requested = TRUE;
CREATE INDEX IF NOT EXISTS idx_resources_workflow ON resources(workflow_id) WHERE workflow_id IS NOT NULL;

-- ============================================================
-- Transactional outbox for at-least-once event delivery
-- ============================================================
CREATE TABLE IF NOT EXISTS outbox_events (
    seq BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(128) NOT NULL,
    partition_key VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_outbox_unpublished ON outbox_events(seq)
    WHERE published_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_outbox_partition ON outbox_events(partition_key, seq);

-- ============================================================
-- Workflow steps for long-running orchestration
-- ============================================================
CREATE TABLE IF NOT EXISTS workflow_steps (
    workflow_id VARCHAR(256) NOT NULL,
    step_index INT NOT NULL,
    step_name VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    input JSONB DEFAULT '{}',
    output JSONB DEFAULT '{}',
    error TEXT DEFAULT NULL,
    started_at TIMESTAMPTZ DEFAULT NULL,
    completed_at TIMESTAMPTZ DEFAULT NULL,
    PRIMARY KEY (workflow_id, step_index)
);

CREATE INDEX IF NOT EXISTS idx_workflow_status ON workflow_steps(status)
    WHERE status IN ('pending', 'running');

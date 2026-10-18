-- Core schema for @portalshq/capability-interaction-orchestrator
--
-- This schema provides the core tables for the Interaction Orchestrator package.
-- Applications can extend these tables with app-specific columns via JSONB or
-- additional tables.
--
-- Migration: 001_interaction_orchestrator_core.sql
-- Version: 0.1.0

-- Input Windows
-- Defines when, where, and how an interaction may happen
CREATE TABLE IF NOT EXISTS input_windows (
  id text PRIMARY KEY,
  revision integer NOT NULL DEFAULT 1,
  world_id text NOT NULL,
  branch_id text NOT NULL,
  base_commit_hash text NOT NULL,
  conflict_key text NOT NULL,

  state text NOT NULL CHECK (state IN ('scheduled', 'open', 'qualifying', 'resolving', 'executing', 'committing', 'published', 'failed', 'cancelled')),

  allowed_input_kinds jsonb NOT NULL,
  arbitration_policy text NOT NULL CHECK (arbitration_policy IN ('first_accepted', 'fifo', 'plurality', 'ranked', 'batch', 'parallel_branches', 'host_selection')),
  arbitration_policy_config jsonb DEFAULT '{}'::jsonb,
  billing_policy text NOT NULL CHECK (billing_policy IN ('free', 'pay_to_generate', 'pay_to_publish', 'pay_for_guaranteed_slot', 'capture_if_selected', 'prepaid_credits')),

  max_submissions_per_user integer NOT NULL CHECK (max_submissions_per_user > 0),
  max_selected_inputs integer NOT NULL CHECK (max_selected_inputs > 0),

  opens_at timestamptz NOT NULL,
  closes_at timestamptz,  -- NULL means always-open

  content_rating text NOT NULL CHECK (content_rating IN ('E', 'T', 'T+', 'M')),
  moderation_policy_version text,
  ruleset_version text,
  price_quote_id text,

  app_metadata jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS input_windows_world_idx ON input_windows(world_id, state);
CREATE INDEX IF NOT EXISTS input_windows_conflict_idx ON input_windows(conflict_key, state);
CREATE INDEX IF NOT EXISTS input_windows_opens_at_idx ON input_windows(opens_at) WHERE state = 'scheduled';

-- Submissions
-- Records what the user wants, eligibility, moderation, payment
CREATE TABLE IF NOT EXISTS submissions (
  id text PRIMARY KEY,
  window_id text NOT NULL REFERENCES input_windows(id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  idempotency_key text NOT NULL,

  kind text NOT NULL CHECK (kind IN ('vote', 'custom_prompt', 'entity_mutation', 'world_action', 'message', 'create_object', 'create_branch')),
  target_entity_ids jsonb,
  base_commit_hash text NOT NULL,

  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('received', 'moderating', 'awaiting_entitlement', 'eligible', 'rejected', 'selected', 'not_selected', 'executing', 'fulfilled', 'failed', 'refunded')),

  moderation_decision_id text,
  entitlement_id text,

  admitted_at timestamptz NOT NULL,
  admission_sequence integer NOT NULL,

  app_metadata jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(actor_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS submissions_window_idx ON submissions(window_id, status);
CREATE INDEX IF NOT EXISTS submissions_actor_idx ON submissions(actor_id, status);
CREATE INDEX IF NOT EXISTS submissions_pending_idx ON submissions(window_id, id)
  WHERE status IN ('received', 'moderating', 'awaiting_entitlement', 'eligible');

-- Resolutions
-- Records what the system chose, execution, commit
CREATE TABLE IF NOT EXISTS resolutions (
  id text PRIMARY KEY,
  window_id text NOT NULL REFERENCES input_windows(id) ON DELETE CASCADE,

  selected_submission_ids jsonb NOT NULL,
  rejected_submission_ids jsonb NOT NULL,

  arbitration_policy text NOT NULL,
  policy_version text NOT NULL,
  resolution_sequence integer NOT NULL,

  base_commit_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('selected', 'executing', 'committed', 'failed')),

  model_execution_id text,
  resulting_commit_hash text,

  app_metadata jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(window_id, resolution_sequence)
);

CREATE INDEX IF NOT EXISTS resolutions_window_idx ON resolutions(window_id, status);

-- Moderation Decisions
-- Records moderation outcomes for submissions
CREATE TABLE IF NOT EXISTS moderation_decisions (
  id text PRIMARY KEY,
  submission_id text NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('allow', 'reject', 'review', 'transform')),
  reasons jsonb,
  policy_version text NOT NULL,
  reviewed_by text NOT NULL CHECK (reviewed_by IN ('rules', 'model', 'human')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moderation_decisions_submission_idx ON moderation_decisions(submission_id);

-- Interaction Outbox
-- Durable event queue for reliable SSE/event publishing
CREATE TABLE IF NOT EXISTS interaction_outbox (
  id text PRIMARY KEY,
  world_id text NOT NULL,
  window_id text,
  event_type text NOT NULL,
  sequence integer NOT NULL,
  payload jsonb NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interaction_outbox_world_idx ON interaction_outbox(world_id, sequence);
CREATE INDEX IF NOT EXISTS interaction_outbox_unpublished_idx ON interaction_outbox(id) WHERE published_at IS NULL;

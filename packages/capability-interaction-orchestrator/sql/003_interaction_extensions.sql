-- Apply after 001 and 002. Choice handoffs, feedback, reactions, selection
-- counts, and external-billing bookkeeping. No destructive rewrites.

-- 'feedback' joins the submission kinds; reactions have their own table
-- because they are windowless events, not arbitrated submissions.
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_kind_check;
ALTER TABLE submissions ADD CONSTRAINT submissions_kind_check CHECK(kind IN
  ('vote','custom_prompt','entity_mutation','world_action','message','create_object','create_branch','feedback'));

-- External credit-billing bookkeeping: retries since the submission first
-- became pending on the billing database.
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS billing_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS billing_pending_since timestamptz;
CREATE INDEX IF NOT EXISTS submissions_pending_billing_idx ON submissions(admitted_at)
  WHERE status = 'awaiting_entitlement';

-- Exactly-once handoff of resolved interaction outcomes to narrative
-- generation. 'claimed' rows past their visibility timeout become claimable
-- again so a process crash cannot lose the handoff.
CREATE TABLE IF NOT EXISTS interaction_narrative_handoffs (
  id text PRIMARY KEY,
  world_id text NOT NULL,
  window_id text NOT NULL REFERENCES input_windows(id) ON DELETE CASCADE,
  resolution_id text NOT NULL REFERENCES resolutions(id) ON DELETE CASCADE,
  option jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('pending','claimed','done','dead')),
  claim_token text,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS interaction_handoffs_claim_idx
  ON interaction_narrative_handoffs(world_id, state, created_at, id);

-- Windowless viewer reactions. Compact by design: emotion is the only
-- viewer-influenced field and it is a fixed enum.
CREATE TABLE IF NOT EXISTS interaction_reactions (
  id text PRIMARY KEY,
  seq bigserial UNIQUE,
  world_id text NOT NULL,
  session_id text,
  actor_id text NOT NULL,
  emotion text NOT NULL CHECK (emotion IN ('love','laugh','fire','sad','angry')),
  event_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS interaction_reactions_world_idx ON interaction_reactions(world_id, seq);
CREATE INDEX IF NOT EXISTS interaction_reactions_rate_idx ON interaction_reactions(actor_id, session_id, created_at);

-- Per-world counts of options offered in choices. Feeds bounded weighted
-- candidate selection; durable so a restart does not reset the rhythm.
CREATE TABLE IF NOT EXISTS interaction_selection_counts (
  world_id text NOT NULL,
  option_ref text NOT NULL,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (world_id, option_ref)
);

# @portalshq/capability-interaction-orchestrator

**Reusable interaction orchestration for Portals:** durable input windows, submission gateway, arbitration engine, moderation gateway, credit-backed billing, guide/choice/feedback/reaction coordinators, and event replay.

## Status

Fully implemented. The package provides durable PostgreSQL-backed interaction lifecycle, external credit billing against `@portalshq/monetization`, collective choices, guide queues and scheduled windows, rewarded feedback, reactions, and an outbox-based event stream. Apply `sql/001`–`003` before use.

## Overview

The Interaction Orchestrator manages user interactions in AI-driven entertainment experiences:

- **Input Windows** — time-bounded (or always-open) opportunities for user interaction
- **Submission Gateway** — validation, idempotency, admission, moderation
- **Arbitration Engine** — configurable contention resolution policies
- **Moderation Gateway** — rating-based and pluggable content moderation
- **Billing** — credit quote/settlement via `@portalshq/monetization`
- **Event Publisher** — durable outbox for SSE signaling and replay

## Installation

```bash
npm install @portalshq/monetization  # peer dependency
npm install @portalshq/capability-interaction-orchestrator
```

## Core Concepts

### Input Windows

An Input Window is a time-bounded opportunity for interaction (`closesAt: null` = always-open).

**Lifecycle:**
```
scheduled → open → qualifying → resolving → executing → committing → published
```

Guide windows may also take a direct `open → published` exit when they close without a resolution.

**Key properties:** `worldId`, `conflictKey`, `arbitrationPolicy`, `billingPolicy`/`billingTerms`, `contentRating`, `closesAt`, `appMetadata`.

### Submissions

A user's proposed action against a window: `windowId`, `actorId`, `idempotencyKey`, `kind`, `payload`, `status`. Multiple submissions compete via arbitration.

### Resolutions

The arbitration outcome: `selectedSubmissionIds`, `rejectedSubmissionIds`, `arbitrationPolicy`, `resultingCommitHash`.

### Arbitration Policies

Seven built-in policies, configurable per window:

1. **first_accepted** — earliest qualifying submission wins
2. **fifo** — every qualifying input executes in order
3. **plurality** — most votes wins
4. **ranked** — priority then tie-break
5. **batch** — combine compatible inputs
6. **parallel_branches** — each input gets an independent result
7. **host_selection** — host manually selects

Custom policies register on `ArbitrationEngine` before use; see `docs/advanced-usage.md`.

### Content Ratings

DC-style ratings: **E** (all ages), **T** (12+), **T+** (15+), **M** (17+). Windows declare a `contentRating`; moderation enforces it.

### Billing Policies

`free`, `pay_to_generate`, `pay_to_publish`, `pay_for_guaranteed_slot`, `capture_if_selected`, `prepaid_credits`. `billingTerms.settle: "claim"` defers the charge to durable claim time (paid guides).

## Channel Configuration

`parseInteractionSettings` parses the `interactions` block of a channel registry; `validateRegistryInteractions` validates it across all channels. `parseChoiceSettings` parses just the choice section.

```jsonc
"interactions": {
  "choice": [
    {
      "option-count": 3,          // answer options composed (2–6, default 3)
      "price": 0,                 // credits per vote (default 0)
      "window-seconds": 14,       // window duration (default 8)
      "persistent": true,         // winner may persist as a reusable prop
      "interval-seconds": 120     // timed: open every ~interval (jittered)
      // OR "model-interval": true — the model proposes openings
    }
  ],
  "guides": [
    {
      "price": 1,                 // credits charged at claim (default 1)
      "window-seconds": 120,      // scheduled window duration (default 120)
      "always-open": false,       // standing queue accepts guides any time
      "interval-seconds": 300,    // timed schedule (required unless always-open)
      // OR "model-interval": true
      "max-pending": 10,          // per-actor pending cap
      "prompt-max-length": 200
    }
  ],
  "feedback": {
    "max-per-session": 1,
    "reward-credits": 1,
    "window-seconds": 120
  }
}
```

Rules:

- Each `choice`/`guides` entry is polymorphic: an object or a single-element array. Multiple events use an array.
- Exactly one scheduling mode per event: `interval-seconds` (timed) **or** `model-interval: true` (model-driven). `always-open` guides declare no schedule.
- `feedback` is a single object (or single-element array); extra elements warn and are ignored.
- Unknown keys throw — typos fail loudly at registry validation.

Parsed types: `InteractionSettings`, `ChoiceSettings`, `GuideSettings`, `FeedbackSettings`, and the shared `InteractionSchedule` (`{ mode: "timed"; intervalSeconds } | { mode: "model" }`).

**Scheduling cadence is app-owned.** The package parses config and provides window primitives; the application decides when to call `openWindow`/`openChoice`. Timed schedules conventionally arm the first event one full interval after boot, then jitter subsequent openings to 0.75×–1.25× the interval so rhythms aren't metronomic.

## Coordinators

`InteractionOrchestrator` composes the lifecycle modules. `orchestrator.guides` and `orchestrator.feedback` exist only when `externalBilling` is configured (they need credit settlement).

### `ChoiceCoordinator` (`orchestrator.choices`)

- `openChoice` — opens a time-bounded `collective_choice` window; emits `choice_opened`.
- `resolveChoice` — closes expired windows, waits for every admitted ballot to reach a definitive billing outcome, then atomically records one winner (random among ties, none on empty ballot), marks ballots consumed, and enqueues the winner into the narrative handoff — all under the `choice:<windowId>` idempotency key so retries replay the stored resolution.
- `validateChoiceOptions` / `validateChoiceProposal` — option-shape validation for model-proposed choices.

### `GuideCoordinator` (`orchestrator.guides`)

Paid guide prompts on shared submission infrastructure, in two shapes sharing one FIFO claim path:

- **Always-open queues** (`alwaysOpen` configs): `ensureWindow` finds or creates one standing window per session and guide key; submissions accepted at any time.
- **Scheduled windows** (timed/model configs): `openWindow` opens a bounded `guideWindow` for `durationSeconds`, emits `guide_opened`, and racing triggers return the already-open window instead of double-opening.

Semantics:

- **Admission is free** — runs normal moderation; the charge happens at **claim**, when the guide reaches a generation turn.
- `submit` routes to the standing queue (`alwaysOpen`) or the open scheduled window for the guide key; `closesAt` enforcement means a published window rejects new guides while admitted submissions stay `eligible`.
- `expireClosed(worldId)` publishes/retires closed guide windows — the only caller that takes the `open → published` transition.
- `claimNext` / `claimNextForSession` durably move the submission to `awaiting_entitlement` *before* the debit call, so a crash can't lose or double-consume a paid guide; the idempotent debit (operation id = submission id) makes retries safe.
- `queueStatus` / `complete` support queue introspection and post-generation cleanup.

### `FeedbackCoordinator` (`orchestrator.feedback`)

Session-capped feedback windows (`feedback` kind, thumbs up/down + optional text); emits `feedback_opened`. `rewardSubmission` grants the configured credit reward exactly once per response.

### `ReactionGateway` (`orchestrator.reactions`)

Windowless emotions (`love`/`laugh`/`fire`/`sad`/`angry`), per-(actor, session) rate limits, seq-ordered listing, scoped `prune` retention.

### `ExternalBilling` (`orchestrator.externalBilling`)

Settles paid submissions against `@portalshq/monetization`'s `debitCredits`/`grantCredits` on a separate billing database. The interaction row parks at `awaiting_entitlement`; the debit runs outside any interaction transaction keyed by submission id; `settlePending()` is the crash-recovery sweep. `settleReward` pays feedback rewards exactly once via `grantCredits`. `usesExternalDebit` detects whether a billing policy routes through it.

### `NarrativeHandoffQueue` (`orchestrator.handoffs`)

Exactly-once delivery of resolved outcomes to generation: `claimNext` uses `FOR UPDATE SKIP LOCKED` + claim token + visibility timeout; `ack`/`fail` retire a claim.

### Lifecycle modules

`orchestrator.windows` (`WindowManager`), `.submissions` (`SubmissionGateway`), `.billing` (`BillingController`), `.arbitration` (via `resolveWindow`). Callers never coordinate submission, billing, and outbox writes themselves — the lifecycle module owns the transaction.

### Selection counts

`orchestrator.choices.getOptionSelectionCounts(worldId)` feeds `weightedChoices` for candidate selection that survives restarts.

## Events and replay

The durable `interaction_outbox` is the replay source; fanout is a wake-up hint. Emitted event types include `window_created`, `window_state_changed`, `submission_created`, `submission_rejected`, `submission_status_changed`, `billing_authorized`, `billing_captured`, `billing_released`, `resolution_selected`, `resolution_executing`, `resolution_committed`, `resolution_failed`, `choice_opened`, `choice_resolved`, `guide_opened`, `feedback_opened`, and `feedback_rewarded`. (Late-joiner snapshots such as `window_snapshot` are synthesized by the consuming app from repository state, not emitted here.) Analytics receives only allowlisted event names, ids, timestamps, and low-cardinality facts — never viewer text.

## Database Setup

Apply the core schema to your PostgreSQL database, in order:

```bash
psql "$DATABASE_URL" -f node_modules/@portalshq/capability-interaction-orchestrator/sql/001_interaction_orchestrator_core.sql
psql "$DATABASE_URL" -f node_modules/@portalshq/capability-interaction-orchestrator/sql/002_durable_lifecycle.sql
psql "$DATABASE_URL" -f node_modules/@portalshq/capability-interaction-orchestrator/sql/003_interaction_extensions.sql
```

### Core tables

`input_windows`, `submissions`, `resolutions`, `moderation_decisions`, `interaction_outbox`.

### App extensions

Applications extend via the `app_metadata` JSONB column on core tables and their own extension tables with foreign keys to core tables.

## Ownership Boundaries

**Package owns:** window lifecycle, admission gates, arbitration policies, billing settlement mechanics, event signaling, core schema.

**Application owns:** when to open windows (scheduling cadence, model-driven triggers), moderation rules, world constraints, model execution, pricing catalog, schema extensions, production workers.

## Peer Dependencies

- `@portalshq/monetization` — billing, entitlements, ledger

## Integration with Portals Packages

- `@portalshq/monetization` — credit settlement (`ExternalBilling`)
- `@portalshq/capability-identity` — actor ID verification (app-side)
- `@portalshq/capability-live-production` — window triggers (app-side)

## Development

```bash
npm run build
npm run typecheck        # includes tsconfig.test.json
npm test
npm run test:coverage
```

## License

MIT

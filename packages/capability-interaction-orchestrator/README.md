# @portalshq/capability-interaction-orchestrator

**Reusable interaction orchestration for Portals:** input windows, submission gateway, arbitration engine, moderation gateway, billing controller, and event publisher.

## Status: Phase 1 (Stub Package) - NOT Production-Ready

This is currently a **stub package** providing TypeScript interfaces and type definitions. Implementations throw "not implemented" errors. Full implementation coming in Phase 2.

**Production Readiness:**
- **Phase 1 (Current):** NOT production-ready - stubs only
- **Phase 2:** Production-ready for basic use cases (FIFO, E-rated, prepaid credits)
- **Phase 3:** Production-ready for all use cases (all policies, all ratings, pluggable moderation)

## Overview

The Interaction Orchestrator provides reusable infrastructure for managing user interactions in AI-driven entertainment experiences. It handles:

- **Input Windows** - Time-bounded opportunities for user interaction
- **Submission Gateway** - Validation, idempotency, and admission
- **Arbitration Engine** - Configurable contention resolution policies
- **Moderation Gateway** - Rating-based and pluggable content moderation
- **Billing Controller** - Integration with `@portalshq/monetization`
- **Event Publisher** - SSE/outbox for frontend signaling

## Installation

```bash
npm install @portalshq/monetization  # Peer dependency
npm install @portalshq/capability-interaction-orchestrator
```

## Core Concepts

### Input Windows

An Input Window represents a time-bounded opportunity for user interaction. Examples:
- A 30-second audience vote on a plot twist
- A 1-minute challenge round in a game show
- An always-open paid prompt queue (set `closesAt` to null)

**Window Lifecycle:**
```
scheduled → open → qualifying → resolving → executing → committing → published
```

**Key Properties:**
- `worldId` - Channel/world identifier
- `conflictKey` - Contention scoping (entity, branch, or session)
- `arbitrationPolicy` - How to resolve contention (FIFO, voting, etc.)
- `billingPolicy` - How to charge (free, pay-to-submit, etc.)
- `contentRating` - Moderation threshold (E, T, T+, M)
- `closesAt` - When window closes (null = always-open)

### Submissions

A Submission is a user's proposed action against a specific target. Multiple submissions may compete for selection via arbitration.

**Key Properties:**
- `windowId` - Window this submission belongs to
- `actorId` - User/app identifier
- `idempotencyKey` - Retry safety
- `kind` - Type of interaction (vote, prompt, mutation, etc.)
- `payload` - Submission data
- `status` - Lifecycle state

### Resolutions

A Resolution represents the outcome of arbitration: which submissions were selected and how they were combined into execution.

**Key Properties:**
- `selectedSubmissionIds` - IDs of selected submissions
- `rejectedSubmissionIds` - IDs of rejected submissions
- `arbitrationPolicy` - Policy used
- `resultingCommitHash` - Resulting world state

### Arbitration Policies

The package supports 7 arbitration policies, configurable per window:

1. **first_accepted** - Earliest qualifying submission wins (exclusive actions)
2. **fifo** - Every qualifying input executes in order (paid story creation)
3. **plurality** - Most votes wins (game shows)
4. **ranked** - Rank by priority, then tie-break (featured submissions)
5. **batch** - Combine compatible inputs (live narrative twists)
6. **parallel_branches** - Every qualified input gets independent result (remix galleries)
7. **host_selection** - Host manually selects (curated events)

### Content Rating System

Based on DC Comics rating system:

- **E (Everyone)** - All ages, cartoonish action, no profanity/violence/sexual content
- **T (Teen)** - Ages 12+, mild violence/language/suggestive dialogue
- **T+ (Teen Plus)** - Ages 15+, moderate profanity, graphic action, mature storylines
- **M (Mature)** - Ages 17+, heavy sexual themes, nudity, extensive profanity, graphic violence

### Billing Policies

- **free** - No payment required
- **pay_to_generate** - Payment before generation
- **pay_to_publish** - Payment after valid preview, before publication
- **pay_for_guaranteed_slot** - Payment for guaranteed submission/placement
- **capture_if_selected** - Authorize payment, capture only if selected
- **prepaid_credits** - Consume prepaid credits

## Phase 1: Stub Package (Current)

**What exists:**
- TypeScript interfaces and types
- Stub implementations (throw "not implemented - Phase 2")
- Core database schema
- Basic documentation

**What's missing:**
- Actual implementations
- Database persistence layer
- Integration with `@portalshq/monetization`
- Integration with `@portalshq/capability-realtime-fanout-postgres`
- Tests

## Phase 2: Core Implementation (Next)

**Will include:**
- Window Manager (in-process window closer via setInterval)
- Submission Gateway (validation, idempotency, admission)
- Arbitration Engine (FIFO policy)
- Moderation Gateway (E-rated, rule-based validators)
- Billing Controller (monetization integration)
- Event Publisher (fanout-postgres integration)
- PostgreSQL persistence layer
- Tests for implemented components
- Migration guide for replacing existing guides.ts

**Production-ready for:**
- Always-open queues (like current guides.ts)
- FIFO arbitration
- E-rated content
- Prepaid credit billing
- Basic SSE event publishing

**Estimated effort:** 60 hours

## Phase 3: Full Feature Set

**Will add:**
- Remaining 6 arbitration policies (plurality, ranked, batch, etc.)
- T, T+, M rating validators
- Pluggable moderation interface for custom validators
- Advanced billing policies
- Complete documentation and examples
- 95% test coverage

**Estimated effort:** 44 hours

## Database Schema

### Core Schema (Package-Provided)

The package provides core tables in `sql/001_interaction_orchestrator_core.sql`:

- `input_windows` - Window definitions
- `submissions` - User submissions
- `resolutions` - Arbitration outcomes
- `moderation_decisions` - Moderation results
- `interaction_outbox` - Event queue

### App Extensions (App-Provided)

Applications can extend core tables via:
- `app_metadata` JSONB column on all core tables
- Additional extension tables with foreign keys to core tables

**Example extension:**
```sql
-- App-specific extension table
CREATE TABLE game_show_windows (
  window_id text PRIMARY KEY REFERENCES input_windows(id),
  round_number integer NOT NULL,
  contestant_count integer NOT NULL
);
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│           Interaction Orchestrator Package                  │
│                   (In-Process Only)                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐        ┌──────────────────┐          │
│  │ Window Manager   │        │Submission Gateway│          │
│  │ - Lifecycle      │        │ - Validation     │          │
│  │ - Triggers       │        │ - Idempotency    │          │
│  │ - State Machine  │        │ - Admission      │          │
│  │ - setInterval    │        │                  │          │
│  └────────┬─────────┘        └────────┬─────────┘          │
│           │                            │                     │
│           └────────────┬───────────────┘                     │
│                        │                                      │
│  ┌────────────────────▼────────────────────┐               │
│  │         Moderation Gateway              │               │
│  │ - Admission validation (built-in)       │               │
│  │ - Content safety (rating-based)         │               │
│  │ - Custom validators (pluggable)         │               │
│  │ - E/T/T+/M rating system                │               │
│  └────────────────────┬────────────────────┘               │
│                        │                                      │
│  ┌────────────────────▼────────────────────┐               │
│  │      Arbitration Engine                  │               │
│  │ - FIFO, voting, branches, etc.           │               │
│  │ - Configurable per window               │               │
│  └────────────────────┬────────────────────┘               │
│                        │                                      │
│  ┌────────────────────▼────────────────────┐               │
│  │      Billing Controller                  │               │
│  │ - Quote, authorize, capture              │               │
│  │ - Integration with @portalshq/monetization│
│  └────────────────────┬────────────────────┘               │
│                        │                                      │
│  ┌────────────────────▼────────────────────┐               │
│  │      Event Publisher                     │               │
│  │ - SSE events, outbox                     │               │
│  │ - Integration with fanout-postgres       │               │
│  └─────────────────────────────────────────┘               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Ownership Boundaries

**Package owns:**
- Window lifecycle
- Admission gates
- Arbitration policies
- Event signaling
- Core database schema

**Application owns:**
- Moderation rules (custom validators)
- World constraints (custom validators)
- Model execution (production layer)
- Pricing (monetization catalog)
- Schema extensions (app_metadata, extension tables)
- Production layer workers (unchanged)

## Peer Dependencies

- `@portalshq/monetization` - Billing, entitlements, ledger

## Integration with Portals Packages

- `@portalshq/monetization` - Billing Controller integration
- `@portalshq/capability-realtime-fanout-postgres` - Event Publisher integration
- `@portalshq/capability-identity` - Actor ID verification
- `@portalshq/capability-live-production` - Window triggers integration
- `@portalshq/queue-broadcast` - Media staging integration

## Migration Path for Bears Live App

**Phase 1:** Apply core schema, keep existing `guides.ts` unchanged

**Phase 2:** 
- Rename `guides.ts` to `interaction-orchestrator-client.ts`
- Rewrite to use new package
- Configure as always-open window (no closesAt)
- Set content rating to "E"
- Test with existing payment flow

**Phase 3:** Add advanced features (voting, branches, etc.)

## Development

```bash
# Build
npm run build

# Type check
npm run typecheck

# Test (Phase 2+)
npm test

# Test with coverage (Phase 2+)
npm run test:coverage
```

## Database Setup

Apply the core schema to your PostgreSQL database:

```bash
psql $DATABASE_URL -f node_modules/@portalshq/capability-interaction-orchestrator/sql/001_interaction_orchestrator_core.sql
```

For Bears Live App migration, see the migration section below.

## Migration from guides.ts to Interaction Orchestrator

### Current State (guides.ts)

The existing `guides.ts` in Bears Live App provides:
- Simple FIFO queue for paid prompts
- 1 credit per prompt via `@portalshq/monetization`
- Basic validation and text model moderation
- Implicit always-open window (no explicit window management)
- Single arbitration policy (all eligible prompts used)

### Migration Path

**Phase 1 (Current):**
- Apply core schema to Bears database
- Keep existing `guides.ts` unchanged
- No functional changes

**Phase 2:**
1. Rename `guides.ts` to `interaction-orchestrator-client.ts`
2. Import `WindowManager`, `SubmissionGateway`, etc. from new package
3. Create an always-open window:
   ```typescript
   const window = await windowManager.createWindow({
     worldId: channelId,
     branchId: "canonical",
     baseCommitHash: currentCommit,
     conflictKey: channelId,
     allowedInputKinds: ["custom_prompt"],
     arbitrationPolicy: "fifo",
     billingPolicy: "prepaid_credits",
     maxSubmissionsPerUser: 1,
     maxSelectedInputs: 5,
     opensAt: new Date().toISOString(),
     closesAt: null,  // Always-open
     contentRating: "E",
   });
   ```
4. Replace `submitGuide()` with `submissionGateway.submitIntent()`
5. Replace `takePendingGuides()` with window closure and arbitration
6. Integrate moderation gateway with existing text model moderation
7. Test with existing payment flow

**Phase 3:**
- Add voting windows for game-show modes
- Add host selection for curated events
- Add parallel branches for remixes
- Add billing variants (pay-if-selected, pay-to-publish)

## Example: Always-Open Paid Prompt Queue

This example shows how to replace the current `guides.ts` with the Interaction Orchestrator:

```typescript
import {
  WindowManager,
  SubmissionGateway,
  ArbitrationEngine,
  ModerationGateway,
  BillingController,
  EventPublisher,
  type CreateWindowInput,
  type SubmitIntentInput,
} from "@portalshq/capability-interaction-orchestrator";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";

// Initialize components (in Phase 2, these will be real implementations)
const windowManager = new WindowManager(pool);
const submissionGateway = new SubmissionGateway(pool);
const arbitrationEngine = new ArbitrationEngine();
const moderationGateway = new ModerationGateway();
const billingController = new BillingController(monetizationStore);
const eventPublisher = new EventPublisher(fanoutBus);

// Create always-open window for paid prompts
async function createPromptWindow(channelId: string): Promise<string> {
  const windowId = randomUUID();
  const window = await windowManager.createWindow({
    worldId: channelId,
    branchId: "canonical",
    baseCommitHash: currentCommit,
    conflictKey: channelId,
    allowedInputKinds: ["custom_prompt"],
    arbitrationPolicy: "fifo",
    billingPolicy: "prepaid_credits",
    maxSubmissionsPerUser: 1,
    maxSelectedInputs: 5,
    opensAt: new Date().toISOString(),
    closesAt: null, // Always-open
    contentRating: "E",
    moderationPolicyVersion: "1.0",
    rulesetVersion: "1.0",
  });
  return window.id;
}

// Submit a paid prompt
async function submitPaidPrompt(
  channelId: string,
  userId: string,
  prompt: string,
): Promise<Submission> {
  const windowId = getOrCreateWindowId(channelId);
  
  const submission = await submissionGateway.submitIntent({
    windowId,
    actorId: userId,
    idempotencyKey: createHash(userId + prompt).digest('hex'),
    kind: "custom_prompt",
    payload: { prompt },
  });
  
  return submission;
}

// Take prompts for next generation (replaces takePendingGuides)
async function takePromptsForGeneration(
  channelId: string,
  limit: number = 5,
): Promise<Submission[]> {
  const windowId = getWindowId(channelId);
  const submissions = await submissionGateway.listSubmissions(windowId, "eligible");
  
  // Resolve via FIFO arbitration
  const resolution = await arbitrationEngine.resolve(
    await windowManager.getWindow(windowId),
    submissions.slice(0, limit),
  );
  
  // Get selected submissions
  const selected = await Promise.all(
    resolution.selectedSubmissionIds.map(id => submissionGateway.getSubmission(id))
  );
  
  return selected.filter((s): s is Submission => s !== null);
}
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│           Interaction Orchestrator Package                  │
│                   (In-Process Only)                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐        ┌──────────────────┐          │
│  │ Window Manager   │        │Submission Gateway│          │
│  │ - Lifecycle      │        │ - Validation     │          │
│  │ - Triggers       │        │ - Idempotency    │          │
│  │ - State Machine  │        │ - Admission      │          │
│  │ - setInterval    │        │                  │          │
│  └────────┬─────────┘        └────────┬─────────┘          │
│           │                            │                     │
│           └────────────┬───────────────┘                     │
│                        │                                      │
│  ┌────────────────────▼────────────────────┐               │
│  │         Moderation Gateway              │               │
│  │ - Admission validation (built-in)       │               │
│  │ - Content safety (rating-based)         │               │
│  │ - Custom validators (pluggable)         │               │
│  │ - E/T/T+/M rating system                │               │
│  └────────────────────┬────────────────────┘               │
│                        │                                      │
│  ┌────────────────────▼────────────────────┐               │
│  │      Arbitration Engine                  │               │
│  │ - FIFO                                    │               │
│  │ - Plurality voting                        │               │
│  │ - First accepted                          │               │
│  │ - Ranked selection                        │               │
│  │ - Batch composition                       │               │
│  │ - Parallel branches                       │               │
│  │ - Host selection                          │               │
│  │ - Configurable per window                 │               │
│  └────────────────────┬────────────────────┘               │
│                        │                                      │
│  ┌────────────────────▼────────────────────┐               │
│  │      Billing Controller                  │               │
│  │ - Quote generation                       │               │
│  │ - Credit reservation                      │               │
│  │ - Authorization/capture                   │               │
│  │ - Settlement                             │               │
│  │ - Refund handling                        │               │
│  │ - Integration with @portalshq/monetization│
│  └────────────────────┬────────────────────┘               │
│                        │                                      │
│  ┌────────────────────▼────────────────────┐               │
│  │      Event Publisher                     │               │
│  │ - SSE events                             │               │
│  │ - Outbox pattern                         │               │
│  │ - Replay support                         │               │
│  │ - Integration with fanout-postgres       │               │
│  └─────────────────────────────────────────┘               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

```
User Input
    │
    ▼
┌─────────────┐
│ HTTP POST   │
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│ Submission       │
│ Gateway          │
│ - Validate       │
│ - Idempotency    │
│ - Check window   │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Moderation       │
│ Gateway          │
│ - Admission      │
│ - Content safety │
│ - World rules    │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Billing           │
│ Controller       │
│ - Quote          │
│ - Authorize      │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Submission       │
│ Stored (DB)      │
└──────────────────┘
       │
       ▼
┌──────────────────┐
│ Window Close      │
│ (setInterval)    │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Arbitration       │
│ Engine           │
│ - Select inputs   │
│ - Apply policy   │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Resolution       │
│ Created (DB)      │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Billing Capture  │
│ (if selected)    │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Model Execution  │
│ (App-owned)      │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Event Publisher  │
│ - Outbox         │
│ - SSE            │
└──────────────────┘
```

## Error Handling

All components should implement comprehensive error handling:

- **Window Manager:** Handle invalid state transitions, missing windows
- **Submission Gateway:** Handle idempotency conflicts, closed windows, validation failures
- **Arbitration Engine:** Handle empty submissions, policy errors
- **Moderation Gateway:** Handle moderation service failures, rating violations
- **Billing Controller:** Handle authorization failures, payment errors
- **Event Publisher:** Handle fanout failures, retry with backoff

## Logging

Components should use structured logging with context:

```typescript
console.log(`[interaction-orchestrator] window=${windowId} state=${state} action=${action}`);
console.error(`[interaction-orchestrator] window=${windowId} error=${error.message}`);
```

## Testing

Phase 2 will include comprehensive test coverage:

- Unit tests for each component
- Integration tests with monetization package
- Integration tests with fanout-postgres package
- Database migration tests
- End-to-end workflow tests

Target: 95% code coverage

## License

MIT

## License

MIT

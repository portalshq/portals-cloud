# @portalshq/capability-interaction-orchestrator

A durable interaction lifecycle for input windows, moderated submissions, selection,
credit-backed billing, execution handoff and replayable events. PostgreSQL owns
admission, quotas, idempotency, credit allocations, resolutions and event ordering.

## Setup

Requires Node.js 22+, PostgreSQL, and the `@portalshq/monetization` entitlement schema
in the **same database**. Apply migrations with errors stopping the transaction:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
  -f node_modules/@portalshq/monetization/sql/001_monetization.sql \
  -f node_modules/@portalshq/capability-interaction-orchestrator/sql/001_interaction_orchestrator_core.sql \
  -f node_modules/@portalshq/capability-interaction-orchestrator/sql/002_durable_lifecycle.sql
```

Deploy the accompanying monetization update together with this package: both use
ID order for grant locks while consuming the oldest matching credits first.
The old `Stub*` exports have been removed. The executable classes now require their
actual dependencies; no implementation silently grants a payment or host approval.

## Lifecycle interface

```typescript
import { Pool } from 'pg';
import {
  InteractionRepository,
  InteractionOrchestrator,
} from '@portalshq/capability-interaction-orchestrator';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const repository = new InteractionRepository(pool);
const interactions = new InteractionOrchestrator(repository);

const window = await interactions.windows.createWindow({
  worldId: 'channel-123',
  branchId: 'canonical',
  baseCommitHash: 'current-commit',
  conflictKey: 'story',
  allowedInputKinds: ['custom_prompt'],
  arbitrationPolicy: 'fifo',
  billingPolicy: 'prepaid_credits',
  billingTerms: {
    tenantId: 'creator-tenant',
    entitlementKind: 'creator-tenant:story_guide',
    amountCredits: 1,
    amountCents: 100,
    currency: 'USD',
    // Set sessionId only when the actual entitlement scope names a session.
  },
  maxSubmissionsPerUser: 1,
  maxSelectedInputs: 5,
  opensAt: new Date().toISOString(),
  closesAt: null,
  contentRating: 'E',
});
await interactions.windows.openWindow(window.id);

const submission = await interactions.submissions.submitIntent({
  windowId: window.id,
  actorId: 'authenticated-consumer-id',
  idempotencyKey: 'request-id-kept-across-retries',
  kind: 'custom_prompt',
  payload: { prompt: 'Explore the old lighthouse' },
});
if (submission.status !== 'eligible') {
  // Rejected inputs and inputs awaiting human review do not enter selection.
  console.log(submission.status);
}
```

`actorId` must come from authenticated application identity. Authorize the caller
against the window's world before exposing submission, cancellation, review,
host-selection, refund or event methods over a network. This package is an internal
module; it does not authenticate HTTP requests. Window configuration, billing terms,
policy configuration and moderation context come from trusted application code.
Submission payloads and app metadata cannot set prices, rank or host authority.

The server reloads prices for `billing.quote(window, actorId)`; the quote is an
informational display, not a payment approval. All paid policies settle **credits
already granted by monetization**. Fiat checkout, Stripe authorization and monetary
refunds belong to monetization's purchase lifecycle. No synthetic Stripe holds are
created here.

Input JSON is limited to 64 KiB and 32 nesting levels; timestamps use ISO UTC with
`Z`. Prompts/messages require their text field; votes require an option or target ID
(and both must agree when present); mutations require target IDs and a parameter
object; object creation requires `payload.object`; branch creation requires a name.
Configure `allowedInputKinds` to operations implemented by your execution adapter.

### Resolve, execute, commit

```typescript
// For finite windows, closeWindow first. An always-open queue can resolve directly.
const resolution = await interactions.resolveWindow(window.id, {
  idempotencyKey: 'generation-request-id',
});
const executable = await interactions.prepareExecution(resolution.id);
// Pass executable to your execution adapter to generate a private preview/artifact.
// Keep proposed world changes private until output moderation and commit succeed.
// Then call commitResolution(resolution.id, proposedOutput, resultingCommitHash).
```

`resolveWindow` persists selection and losing-input refunds atomically. Selection
has a window-scoped retry key; reusing it with a different host selection fails.
Only one selected/executing resolution may exist per window. `prepareExecution`
checks backing grants and captures selection-dependent credits before execution.
`commitResolution(id, output, hash)` moderates the complete output, captures deferred
publication credits and records fulfillment and events together. A non-allow output
fails the resolution and releases/refunds its credits. For parallel branches, supply
`{ [selectedSubmissionId]: branchCommitHash }` instead of one hash; the canonical
head stays unchanged. Output and commit targets must match on a retry.

The owned execution adapter must enforce base-commit conflicts against its world
store. A hash supplied to this module identifies a private proposed artifact;
publication happens only after a committed resolution. PostgreSQL transactions do
not make an external provider call or world-store write atomic.

`failResolution(id, reason)` refunds selected work and records failure. Use it after
an execution failure or expired/revoked hold; retrying a failed resolution requires
a new submission. `cancelWindow(id)` cancels pending inputs and refunds their credits
in one transaction, refusing to interrupt an active resolution.

## Selection policies

| Policy | Behavior |
| --- | --- |
| `fifo` | Admission order, with ID as the final deterministic tie-break |
| `first_accepted` | The first eligible input |
| `plurality` | Distinct actors per option/target, descending vote count, then admission order; selects one representative per winning target |
| `ranked` | Trusted `arbitrationPolicyConfig.priorities[submissionId]`, then admission order; ignores payload priority |
| `batch` | Admission order, combining nonoverlapping `targetEntityIds` up to capacity |
| `parallel_branches` | Admission order up to capacity, one stable branch destination per selected input |
| `host_selection` | Explicit `selectedSubmissionIds` passed to `resolveWindow`; rejects unknown, duplicate or excessive IDs |

All policies respect `maxSelectedInputs`. Custom policies must partition the eligible
inputs exactly once into selected and rejected IDs. The arbitration engine is a
pure selection module; its `resolutionSequence: 0` is an unpersisted proposal.
The orchestrator allocates the actual monotonic sequence under the window lock.

For always-open FIFO/parallel queues, overflow stays eligible for the next generation
and is recorded in `appMetadata.deferredSubmissionIds`. Finite-window losers are
marked `not_selected` and refunded. Prompt/message/vote inputs can follow a moving
queue head; state-changing inputs with an old base must be cancelled and resubmitted
after application revalidation. Active per-user quota counts pending, eligible,
selected and executing inputs; completed/rejected/cancelled inputs free that quota.
Scheduled windows can coexist, but opening two windows with the same world, branch
and conflict key fails.

## Moderation

`ModerationGateway` checks every nested string in JSON input/output. Its defaults
provide configurable term rules, Unicode normalization, word edges, input length
200 and output length 32,000. E blocks mild/strong profanity, explicit terms and
graphic violence terms; T permits mild profanity; T+ permits strong profanity and
graphic violence; M permits these categories. Blocked/prohibited terms apply at
every rating. These are text rules, not semantic or image/video classification.
Install application/model validators for contextual content decisions and non-text
media inspection. Version your configuration with `moderationPolicyVersion`.

Custom validators cannot bypass the built-in rules. Missing `validateOutput` falls
back to `validate` with the complete output in a synthetic submission. Validator
exceptions and malformed decisions stop qualification. `review` and `transform`
remain in `moderating`; only an explicit trusted
`submissions.reviewSubmission(id, 'allow' | 'reject', reasons)` completes them.
Transforms are never silently applied. `contextFor(window)` injects application
world rules; each request uses its own rating context.

## Billing behavior

| Policy | Admission | Selection/execution | Commit |
| --- | --- | --- | --- |
| `free` | Zero-credit reservation | Verify lifecycle | No charge |
| `prepaid_credits` | Consume credits | Validate backing grants | Fulfill |
| `pay_to_generate` | Consume credits | Validate backing grants | Fulfill |
| `pay_for_guaranteed_slot` | Claim capacity and consume credits | Guaranteed FIFO/parallel selection | Fulfill |
| `capture_if_selected` | Deduct a credit hold from spendable balance | Capture selected holds; release losers | Fulfill |
| `pay_to_publish` | Deduct a credit hold | Generate a private preview | Capture only on allowed output |

Guaranteed slots require FIFO or parallel selection and cannot overbook capacity.
Reservations default to one hour; configure `reservationTtlMs` (1 second–24 hours).
A hold expires no later than its earliest backing grant. Captured prepaid credits
remain spent while queued. Cancellation, failed execution, non-allow output and
finite-window loss release/refund exactly once, restoring only surviving unexpired
original grants. A deleted/refunded purchase's grant is never recreated. Expired
credits cannot be made spendable by an interaction refund. Deferred captures check
expiry and revocation again at execution/publication.

## Events and workers

`EventPublisher` accepts `createPostgresFanoutBus(pool)` or `InMemoryFanoutBus` through
the fanout seam. Set up `fanout_messages` as documented by
[`capability-realtime-fanout-postgres`](../capability-realtime-fanout-postgres).
Lifecycle writes enqueue events; call `drainOutbox()` from a worker. Publishing to
the transport is at least once, with expiring claims and token-checked acknowledgment.
Failed deliveries stay durable for retry. Each event has a stable ID and a
transactionally allocated world sequence. Topics use `interaction:${worldId}`.

`subscribe(worldId, afterSequence?, { signal? })` returns an async iterator. With a
cursor it replays all later events in bounded pages; without one it starts at the
current head. Fanout messages wake the iterator; the database remains authoritative
for ordering and deduplication. Polling recovers missed hints. Abort, iterator return
and exceptions release subscriptions and timers, including a read that is waiting.
Use `String(event.sequence)` for SSE `id`; validate and authorize `Last-Event-ID`.
`getEvents` returns at most 100 events per page. The iterator handles pagination.

Run these bounded jobs with error reporting and nonoverlapping invocations:

- `windows.startWindowCloser(5000)` closes due finite windows; always-open queues remain open.
- `billing.expireReservations()` releases expired, unselected holds in batches of 100.
- `submissions.resumeSubmission(id)` recovers a durable `received` admission after an outage. Find these through application recovery jobs or `listSubmissions(windowId, 'received')`.
- `events.drainOutbox()` delivers a bounded outbox batch; repeat while work remains.

Open scheduled windows explicitly at their scheduled time. Finish the active
always-open queue resolution before explicitly closing its intake. Stop/await the closer,
abort/return all event iterators, finish in-flight worker jobs and then close the
caller-owned fanout bus and pool during shutdown. A selected/executing expired hold
requires `failResolution`; it is never silently reassigned. Use trusted operator
`billing.refund` for completed work; active resolutions must fail first.

Repository transactions serialize admission/selection per window, world event writes
per world, and credit mutations in grant-ID order. Keep network calls outside these
transactions. The exported repository and `*InTransaction` methods are low-level
integration seams; use `InteractionOrchestrator` for lifecycle operations. Retain
outbox history for the promised replay period and monitor unpublished age, pending
qualification age, expiring holds and failed resolutions. This package does not
silently prune audit/replay data.

## Validation and migration

```sh
npm run build --workspace=packages/monetization
npm run build --workspace=packages/capability-interaction-orchestrator
npm run typecheck --workspace=packages/capability-interaction-orchestrator
npm run test:coverage --workspace=packages/capability-interaction-orchestrator
```

Tests use embedded PostgreSQL (PGlite) by default, applying real migrations. To verify
multiple connections against a scratch PostgreSQL instance, set both
`INTERACTION_TEST_MODE=non-production` and `INTERACTION_TEST_DATABASE_URL`. Each suite
creates/drops only its randomly named schema. Coverage thresholds are 95% for lines,
statements, functions and branches and are enforced in the PostgreSQL CI job.

See the repository's
[migration guide](https://github.com/portalshq/portals-cloud/blob/main/packages/capability-interaction-orchestrator/docs/bears-live-app-migration.md)
and [advanced usage](https://github.com/portalshq/portals-cloud/blob/main/packages/capability-interaction-orchestrator/docs/advanced-usage.md).

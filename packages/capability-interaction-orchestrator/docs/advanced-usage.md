# Advanced usage

Use `InteractionOrchestrator` for state transitions. The selection, moderation and
execution seams accept real adapters; the PostgreSQL repository keeps transaction
coordination inside the lifecycle module.

## A custom arbitration policy

Names match `[a-z][a-z0-9_]{0,63}`. Register the adapter in the engine supplied to the
orchestrator before resolving windows using it. Every result must partition all
eligible input IDs exactly once, respect capacity and preserve the window/base/policy.
The engine clones its inputs and validates the result. Window policy configuration
overrides engine defaults; it must come from trusted application configuration.

```typescript
import { randomUUID } from 'node:crypto';
import {
  ArbitrationEngine,
  InteractionOrchestrator,
  InteractionRepository,
  interactionFor,
  type ArbitrationPolicy,
} from '@portalshq/capability-interaction-orchestrator';
import type { Pool } from 'pg';

export function createNewestFirstInteractions(pool: Pool) {
  const newestFirst: ArbitrationPolicy = {
    name: 'newest_first',
    resolve(window, submissions) {
      const ordered = [...submissions].sort((a, b) =>
        b.admissionSequence - a.admissionSequence || a.id.localeCompare(b.id));
      const selected = ordered.slice(0, window.maxSelectedInputs);
      return {
        id: randomUUID(),
        windowId: window.id,
        selectedSubmissionIds: selected.map(s => s.id),
        rejectedSubmissionIds: ordered.slice(selected.length).map(s => s.id),
        arbitrationPolicy: 'newest_first',
        policyVersion: '1.0.0',
        resolutionSequence: 0,
        baseCommitHash: window.baseCommitHash,
        status: 'selected',
        appMetadata: {
          videoProviderInteractions: selected.map(s => ({
            submissionId: s.id,
            interaction: interactionFor(s),
          })),
        },
      };
    },
  };
  const arbitration = new ArbitrationEngine();
  arbitration.registerPolicy(newestFirst.name, newestFirst);
  return new InteractionOrchestrator(new InteractionRepository(pool), { arbitration });
}
```

Set `arbitrationPolicy: 'newest_first'` on a newly created window to use this adapter.
Changing existing adapters requires maintaining the recorded `policyVersion` semantics;
keep old implementations available to the application until active work completes.
Arbitration runs while a window is locked, so adapters must be deterministic in their
selection logic and must not perform network calls.

## Application rules and custom moderation

`contextFor(window)` injects trusted world rules into both input and output moderation.
The rule sees the complete payload; output payloads contain `{ output }`. Exceptions
stop qualification. Add a custom validator when a rule requires `review` rather than
a rejection, or when a model/media adapter must run asynchronously.

```typescript
import { randomUUID } from 'node:crypto';
import {
  ModerationGateway,
  type CustomValidator,
  type ModerationDecision,
} from '@portalshq/capability-interaction-orchestrator';

export function moderationForProtectedEntities(protectedIds: ReadonlySet<string>) {
  const validator: CustomValidator = {
    name: 'protected_entities',
    async validate(input, context): Promise<ModerationDecision> {
      const protectedTarget = input.targetEntityIds.some(id => protectedIds.has(id));
      return {
        id: randomUUID(),
        submissionId: input.id,
        status: protectedTarget ? 'review' : 'allow',
        reasons: protectedTarget ? ['A protected entity needs host review'] : [],
        policyVersion: context.policyVersion ?? '1.0.0',
        reviewedBy: 'rules',
        createdAt: new Date().toISOString(),
      };
    },
  };
  const moderation = new ModerationGateway({ policyVersion: '1.0.0' });
  moderation.registerCustomValidator(validator);
  return moderation;
}
```

Input-only validators also run on synthetic output submissions when they do not define
`validateOutput`. The example's entity rule sees no target IDs in that synthetic
submission; protect proposed world changes with a world rule or dedicated output
validator inspecting the output's actual mutation list. Text rules do not classify
images or video. A production media validator must inspect the actual media artifact,
return a real decision and throw on inspection failure.

`review` and `transform` inputs wait for explicit host review. Call
`submissions.reviewSubmission(id, 'allow', ['review evidence'])` only from an authorized
operator path. To apply a rewrite, reject/cancel the original and submit the reviewed
replacement with a new request ID; the original moderation evidence remains intact.
Non-allow output decisions fail/refund the current resolution instead of publishing it.

## Execution adapters and parallel branches

`prepareExecution` returns an `executing` resolution. Pass it to `ExecutionBridge`:

```typescript
import {
  createExecutionBridge,
  type IVideoProvider,
} from '@portalshq/capability-interaction-orchestrator';

export function executionFor(
  provider: IVideoProvider,
  canonicalSessionId: string,
  sessionForBranch: (branchId: string) => Promise<string>,
) {
  return createExecutionBridge({
    videoProvider: provider,
    videoProviderSessionId: canonicalSessionId,
    sessionForBranch,
  });
}
```

The provider must implement durable deduplication of
`sendInteraction(sessionId, interaction, { idempotencyKey })`. Keys are stable per
resolution/submission. A successful send followed by a lost response must not apply
an interaction twice on retry. `sessionForBranch` must idempotently allocate/retrieve
a distinct session for each stable branch ID. The bridge validates every entry before
sending any and propagates failures. It does not invent provider retries or pretend
a remote side effect can be rolled back by PostgreSQL.

After generating private branch artifacts, commit with one hash per selected input:

```typescript
import type { InteractionOrchestrator, Resolution } from '@portalshq/capability-interaction-orchestrator';

export async function commitBranches(
  interactions: InteractionOrchestrator,
  resolution: Resolution,
  proposedOutput: unknown,
  hashesBySubmissionId: Record<string, string>,
) {
  return interactions.commitResolution(resolution.id, proposedOutput, hashesBySubmissionId);
}
```

All outputs in a resolution must pass moderation before that resolution publishes.
If any selected result fails, fail/refund the resolution and leave generated artifacts
private. Parallel commit hashes are stored in `appMetadata.commitTarget`; they do not
advance the canonical window head. Enforce external branch/world commit conflicts in
the owned execution adapter.

## Worker and shutdown integration

This helper drives expiry and outbox delivery without overlapping work. The host owns
error reporting and closes its pool only after awaiting shutdown. Admission recovery
can separately call `resumeSubmission` for durable `received` records.

```typescript
import type { EventPublisher, InteractionOrchestrator } from '@portalshq/capability-interaction-orchestrator';

export function startInteractionWorkers(
  interactions: InteractionOrchestrator,
  events: EventPublisher,
  reportError: (error: unknown) => void,
) {
  let stopped = false;
  let running: Promise<void> | undefined;
  interactions.windows.startWindowCloser();
  const tick = () => {
    if (stopped || running) return;
    running = (async () => {
      await interactions.billing.expireReservations();
      await events.drainOutbox();
    })().catch(reportError).finally(() => { running = undefined; });
  };
  const timer = setInterval(tick, 1000);
  timer.unref();
  tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await interactions.windows.stopWindowCloser();
    await running;
  };
}
```

Pass each request's abort signal into `events.subscribe`; returning the iterator also
interrupts a waiting read. SSE IDs are per-world sequences, not transport IDs. Transport
claims expire after 30 seconds, so a worker crash may redeliver a message. Consumers
using the module's iterator read from the durable outbox and receive each sequence in
order. Direct raw fanout consumers must deduplicate stable event IDs themselves.

## Error and recovery contracts

`InteractionError.code` separates invalid input, closed windows, quotas, retry conflicts,
pending qualification, active resolutions, expired/revoked credit grants and stale
base commits. Insufficient credits during submission are a persisted rejection plus
an event carrying `INSUFFICIENT_CREDITS`. Database/provider outages remain exceptions;
retry with the same request ID. Never convert an unknown exception into eligibility.

Input admission is durable before remote moderation. A process crash leaves `received`
work that `resumeSubmission` can retry. Concurrent retries may invoke a moderation
adapter more than once; only one moderation/billing result commits. Give paid external
moderation requests their own deduplication key if needed.

After a committed selection, retry `prepareExecution`/execution with the same resolution
ID, or explicitly fail the resolution. On expired/revoked backing grants, fail the
active resolution before accepting a replacement. Completed commits are immutable:
same output/target retries return the stored result without rerunning moderation;
changed output/targets fail with `IDEMPOTENCY_CONFLICT`.

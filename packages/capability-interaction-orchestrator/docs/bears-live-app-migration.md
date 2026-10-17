# Migrating a paid guide queue

The external Bears Live App and its `guides.ts` are not in this checkout. This guide
specifies the tested replacement lifecycle; verify the application's actual identity,
entitlement kind/scope, credit rules, generation adapter and schema before cutover.
The package tests exercise the lifecycle and PostgreSQL migration, not that external
application's deployment.

## Prepare the database

Back up the existing guide and monetization data. Apply monetization 001, orchestrator
001, then 002 in a single migration transaction with `ON_ERROR_STOP=1`, as in the
package README. Keep existing guide tables intact. Before adding 002's unique indexes,
inspect existing data for duplicate admission sequences, world event sequences or
active windows sharing `(world_id, branch_id, conflict_key)`. Resolve any historical
duplicates through an audited application migration; 002 deliberately fails instead
of discarding records. Scheduled windows are not active windows for this check.

Deploy the companion monetization lock-order update together with the orchestrator.
Use the same PostgreSQL database for grants and interaction state. Install and index
`fanout_messages` if using the PostgreSQL fanout adapter. Existing paid windows must
receive trusted billing terms before admitting submissions; 002 cannot infer tenant,
entitlement kind, scope or price from old metadata.

## Map the application's behavior

Create one always-open FIFO window for each guide queue, with the real current world
commit and `closesAt: null`. Persist its ID in application configuration. Serialize
window provisioning through your existing application configuration transaction; do
not use a read-then-create race on every request. The active conflict-key index also
prevents two open windows for the same queue.

The old guide's viewer ID maps to the authenticated monetization consumer ID. Its
prompt maps to `payload.prompt`; display name can be copied to `appMetadata` after
application validation. Never infer identity from a submitted email or display name.
The request's persisted ID is its idempotency key. Reusing that ID with changed content
returns `IDEMPOTENCY_CONFLICT`; hashing prompt text would incorrectly suppress a
later intentional repeat.

Use `billingTerms.tenantId`, `entitlementKind` and scope dimensions matching the actual
monetization grants. A world branch is not automatically an entitlement session.
Explicitly configure the real `sessionId` only if the purchase grant names it.
Choose the current server credit amount and informational currency price. Do not
consume through the old guide path as well as through this module.

## Replace intake and generation

Replace intake with `interactions.submissions.submitIntent`. Only `eligible` means
qualification succeeded. Rejected insufficient-credit inputs are persisted as
`rejected`; review/transform inputs remain `moderating`. Retries return the stored
record. Route error codes to the existing UI without treating an exception or
`moderating` status as a charge or acceptance.

Replace `takePendingGuides(limit)` with `resolveWindow(windowId, { idempotencyKey })`.
Set `maxSelectedInputs` to the generation limit when creating the window. Load the
resolution's selected submission IDs through `submissions.getSubmission`; do not
mark selection manually. Call `prepareExecution` before sending selected prompts to
the generator. Keep generation artifacts private and use the resolution/submission
IDs to deduplicate external dispatch. Finish with `commitResolution` after producing
the private proposed output and artifact hash. Publish only a `committed` result.
Call `failResolution` on generation failure to refund exactly once.

Queue overflow remains eligible, with paid credits attached, for the next generation.
The window remains open; prompt inputs can follow its advancing head. A selected
resolution blocks competing consumers until it commits or fails. Subsequent generations
use a new persisted request ID. Do not discard the ID when retrying an interrupted run.

## Existing guide data

Avoid copying already charged pending guides into `submitIntent`: that would charge
them again. Use a controlled drain: disable intake on the old path, keep its generation
worker running until pending charged guides finish, and then switch both intake and
generation to the new window. If importing historical data is necessary, write a
separate application migration with a reconciled credit ledger, actor/request ID map,
moderation evidence and an auditable no-double-charge import procedure. Do not use
normal submission admission as an import facility.

## Staging acceptance

Use an isolated database and the explicit non-production test mode. Verify a consumer
with credits, one without credits, retrying the same request, conflicting retry content,
concurrent submissions against quota, moderation rejection/review, queue overflow,
provider failure and exactly-once credit restoration. Simulate restart after admission,
a selected resolution and outbox publication. Confirm the application resumes/fails
work using its persisted request IDs. Verify the SSE route's authentication, replay
cursor and disconnect cleanup, as well as shutdown of workers and iterators.

Compare balances and pending work before and after each staging scenario. The package
suite covers these transaction paths; the application's provider credentials and world
publication behavior require its own staging acceptance.

## Cutover and rollback

Switch intake and generation together after the old queue drains. Monitor errors,
credit balances, qualification age, active resolutions and outbox lag. Retain old
rows and a backup through your rollback period.

If rollback is required, pause new intake, let active new resolutions complete or
fail/refund them, and reconcile any remaining new eligible submissions before
resuming the old queue. Merely reverting code strands paid work and can double-charge
resubmissions. Keep all new tables and audit records; do not drop schema as a rollback
step. Resume the old path only after confirming which requests still own credits.

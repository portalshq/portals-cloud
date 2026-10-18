# CRM acceptance contract

This document defines the repeatable CRM acceptance run for the Next.js lead
pipeline. It keeps the live test isolated from production leads and avoids
contacting real people.

## Current implementation and existing coverage

- `frontend/src/lib/leads/crm.ts` projects verified lead submissions and
  account/pilot lifecycle events into Apollo. Neon is the source of truth;
  `crm_external_records` stores remote IDs and `crm_outbox` retries events.
- `frontend/app/api/internal/leads/retry/route.ts` is the authenticated retry
  entry point. It calls `processLeadOutbox(50)`, which drains every due lead and
  CRM outbox row in the configured database. It does not select one test row.
- `frontend/vercel.json` schedules that endpoint daily at `00:00 UTC`. New
  request paths also run outbox work opportunistically.
- The Mac production Compose file runs Auth, Lore, and Caddy; it does not run
  BackendService. The legacy BackendService source has a 60-second CRM poll,
  but it is not the scheduler for this Mac deployment. Do not run that old
  service alongside the Vercel job without an explicit deployment change.
- `npm --workspace frontend run test:leads` covers mocked frontend CRM,
  mapping, and outbox behavior. `npm --prefix services/backend-service test`
  covers the legacy backend's mocked Apollo request contract and health route.
  These tests make no live Apollo or Neon calls.

## Required isolation before any live run

Use a dedicated Vercel Preview deployment and a disposable Neon branch. The
branch must contain the current `frontend/migrations` schema and only synthetic
acceptance rows. Do not point the cron endpoint at the production database:
one invocation drains all due production outbox actions, including unrelated
messages and lead work.

Use a dedicated Apollo test workspace or an operator-approved isolated test
workspace with a test-only API key. Its only test records must be synthetic and
recognizable by the run ID. The current email sender calls Resend directly and
has no configurable sink or recipient suppression. A normal synthetic lead
submission queues email work as well as the Apollo projection. Therefore a
no-email live cron test needs either a test-only delivery sink added and
verified in code, or a CRM-only synthetic outbox fixture that queues no email
action. The present repository does not yet provide either live fixture
mechanism. Never invoke the cron on a database with unrelated due rows. Never
use a real prospect address, a customer record, or a real outbound sequence.
Do not enroll a test contact in a sequence.

Before running, record these non-secret identifiers in the acceptance report:

- Vercel Preview deployment URL and project/environment name.
- Neon project/branch identifier and branch creation time.
- Apollo test workspace identifier and test-key label (never the key).
- A unique run ID and the synthetic contact email/domain reserved for the test.
- The delivery-sink configuration and proof that no real external message is
  sent.
- The designated cleanup owner and the maximum lifetime for the test branch and
  synthetic Apollo records.

If Apollo cannot provide an isolated workspace, or the Vercel route cannot be
bound to an isolated Neon branch, the live CRM acceptance is not safe to run.
Do not substitute the production workspace or production branch.

## Repeatable acceptance sequence

1. Confirm the test Vercel deployment has the test branch's `LEADS_DATABASE_URL`,
   application encryption/hash keys, `CRON_SECRET`, and test-only `APOLLO_API_KEY`.
   A test-only mail sink or a CRM-only fixture is a hard prerequisite before
   creating CRM outbox work. Keep production credentials out of the test
   deployment.
2. Apply the frontend migrations to the disposable branch:

   ```sh
   cd frontend
   npm run migrate:leads
   ```

   Run with `LEADS_DATABASE_URL` directed only at the disposable branch; the
   migration script reads `frontend/.env.local`, so verify that file's target
   before invocation and do not copy production URLs into it.
3. Create one approved synthetic lead fixture with a new run-specific
   idempotency key and a synthetic email. The fixture must queue exactly one
   `apollo_sync` action and must not queue an email or sequence action. The
   repository currently lacks a supported live fixture seeder; add that driver
   before executing this step, or use an approved test-only email sink. Do not
   use an already-existing Apollo contact. Capture the returned
   submission/profile identifiers without recording credentials or form secrets.
4. Confirm in Neon that the matching `lead_outbox` contains the expected
   `apollo_sync` action and that the stored profile/contact mapping is scoped to
   the test fixture. Ensure the row is the only due acceptance row before
   invoking the retry endpoint; the endpoint processes the whole due queue.
5. Invoke the Preview retry route using the test deployment's CRON secret:

   ```sh
   curl --fail-with-body --silent --show-error \
     -H "Authorization: Bearer ${CRON_SECRET}" \
     "${CRM_ACCEPTANCE_BASE_URL}/api/internal/leads/retry"
   ```

   `CRM_ACCEPTANCE_BASE_URL` must name the isolated Preview deployment. Do not
   put the secret in a command line saved to shell history or in the report.
6. Verify the outbox action reached `complete`, the local Apollo record mapping
   is present, and exactly one matching synthetic Apollo record exists in the
   test workspace. Run the retry route again; the local idempotency key and
   `crm_external_records` mapping must prevent a duplicate record.
7. In the isolated branch only, induce one controlled transient Apollo error
   using the test connector/mock or an intentionally invalid test-only API key.
   Verify the outbox moves to `retry`, records a bounded error without secrets,
   and becomes `complete` after restoring the test key and rerunning the route.
   Do not intentionally break the production integration.
8. Verify no email or sequence action was queued (or that the configured,
   independently tested sink captured it) and no real recipient received a
   message. Confirm no CRM sequence enrollment or other outbound action occurred.
9. Export the sanitized evidence (run ID, branch/workspace IDs, outbox states,
   remote synthetic record ID, timestamps, retry count, and delivery-sink
   result). Remove the synthetic Apollo records using the workspace's approved
   cleanup method, then delete the disposable Neon branch and Preview variables
   according to the agreed retention window. Record cleanup completion.

## Acceptance result

Pass only when all of these are evidenced together: the isolated Preview is
connected to the disposable Neon branch; one synthetic Apollo projection
completes; a repeated run creates no duplicate; a transient failure retries to
success; no customer data or real communications are involved; and fixture
cleanup is complete. A passing mock test, a successful HTTP 200 from the cron
route, or an Apollo record by itself is not a pass.

The repository currently has no live end-to-end CRM fixture driver and no
email sink configuration. This contract deliberately requires the isolated
Preview, Neon branch, Apollo test workspace, and a CRM-only/no-email fixture
mechanism before live mutation. Until those prerequisites exist, the existing
mocked tests are the only executable CRM acceptance evidence; this runbook is
not a claim that the live run is currently safe or completed.

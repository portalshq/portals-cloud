# Delivery worker (shared bootstrap scaffold)

This runtime belongs to ProductCharacters.com. Portals does not create or own
delivery jobs, Stripe delivery webhooks, or the worker's product workflow.

This is a separate runtime boundary for paid Lore delivery. It is intentionally
not embedded in Next.js or Lore.

## Current status

This directory provides the reusable runtime boundary and deployment scaffold:
health/readiness, signed wake handling, replay protection, lease-safe claiming,
and content-addressed package verification. ProductCharacters owns the actual
job schema and product-specific webhook integration. Remote Lore execution
remains explicitly gated until the
fork-compatible SDK/protocol adapter passes its release tests.
The `LoreDeliveryAdapter` contract in `src/lore.ts` is the only supported seam
for enabling that integration.

## Runtime boundary

- Runs as its own container/process on the bootstrap Mac.
- Uses its own service account, workspace, logs, limits, and secrets.
- Mounts no Lore data directory and has no Stripe credentials in Lore.
- Calls Lore through the authenticated public protocol path (Pinggy/Caddy in
  production; the equivalent local endpoint in development).
- Neon is the source of truth for jobs, payment state, delivery state, leases,
  and audit events.
- Exposes one narrowly scoped wake endpoint through Pinggy. It accepts only a
  short-lived HMAC-signed request from the Vercel webhook path, validates a
  timestamp and replay id, and triggers a bounded claim pass. It cannot create
  jobs, accept credentials, or bypass normal authorization.

## Required contract before implementation

1. Add an idempotent `delivery_jobs` state machine and migration. A unique
   Stripe event/payment key must prevent duplicate jobs.
2. Add a transactional claim lease (`owner`, `expires_at`, attempt count) and
   explicit retry/permanent/manual-review outcomes.
3. Add the pinned `@lore-vcs/sdk` release and native Lore library checksum.
   Use the SDK for local repository inspection, package preparation, status,
   commit, and other operations it actually exposes. The SDK is a native
   library binding; it is not a replacement for the authenticated remote Lore
   protocol. Remote repository import/push must use the supported Lore network
   API, with a thin adapter only where the SDK has no equivalent.
   The active SDK pin is recorded in `cloud/infra/lore/versions.yaml`; the
   worker must receive `LORE_SDK_VERSION` from that release manifest and stays
   unready if it differs from the installed package version.
4. Add a worker-only machine credential with repository/account scope; never
   reuse a browser token.
5. Add package manifest + SHA-256 verification and bounded workspace cleanup.
6. Add the reconciliation sweep (configurable interval)
   and an immediate HMAC-signed wake-up hook from the Vercel webhook. The
   sweep is recovery, not the normal dispatch path.
7. Add tests for duplicate Stripe delivery, lease expiry, retry classification,
   repository conflict, cross-repository denial, digest mismatch, and graceful
   shutdown.

## Deliberate MVP limits

- No automated Stripe Connect payout release until delivery, refund, and audit
  behavior is proven. Use manual approval first.
- No object-storage dependency for short-lived packages; encrypted local
  storage is sufficient until retention or package size requires otherwise.
- No identity-provider calls from the worker; Next passes application job
  context and the worker uses only its machine identity.

## Health and operations

The eventual process must expose `/health` (process) and `/ready` (Neon,
Lore, and CLI availability), stop claiming new jobs on shutdown, and leave an
expired lease for recovery. Logs must be structured and must not contain tokens,
payment secrets, package contents, or repository credentials.

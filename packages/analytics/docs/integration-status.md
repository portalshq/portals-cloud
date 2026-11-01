# Integration status

## Automatic delivery connector

`AnalyticsConnector` (`@portalshq/analytics/connector`) is the supervised,
independent delivery path for committed business records. It owns the
`portals_analytics_delivery`, `portals_analytics_discovery`, and
`portals_analytics_migrations` tables in the application database, applies its
own versioned migrations on start, and reads the business outboxes read-only.
Monetization and interaction-orchestrator do not import this package, host
analytics callbacks, or make vendor calls on their transaction paths.

Deployment prerequisites:

- A database role with permission to create the package tables on first start
  and read access to `monetization_outbox` (required) and `interaction_outbox`
  (required only when interaction delivery is enabled).
- `ANALYTICS_DATABASE_URL`, `SEGMENT_SERVER_WRITE_KEY`, `ANALYTICS_APP_ID`,
  `ANALYTICS_TENANT_ID`, and a UTC `ANALYTICS_START_AT` cutoff. Records inserted
  before the cutoff are never introduced automatically; the bounded backfill
  command is the explicit operator path.
- For interaction delivery, `ANALYTICS_CONTEXT_MODULE` must point to a host ES
  module exporting `resolveWorld(worldId)` (authoritative world→tenant
  authorization) and `resolveInteractionIdentity(record)` (verified user ID).
  Without it the connector runs billing-only and reports the interaction
  source as `disabled` in `status()`.
- Retained source rows: the outboxes must keep committed records until
  delivery is verified in the warehouse. Coordinate retention with the owning
  packages.

Delivery semantics: at least once. A crash after Segment acceptance but
before the ledger update can resend the same namespaced `messageId`; analytics
views must deduplicate by `portals_source_kind` + `portals_source_id` (or
`portals_event_id`). Segment acceptance is not GA4 or BigQuery arrival; use
`reconciliation/reconcile.sql` against normalized source snapshots and the
configured warehouse feed.

Failure model: `pending` rows retry with capped backoff until `maxAttempts`,
then become `dead` (`retry_exhausted`). Unsupported event types are `excluded`
at discovery-to-delivery time. Records blocked on `missing_identity` or
`invalid_attribution`, and `dead` records on `malformed`, `missing_source`,
`rejected`, or `retry_exhausted`, are visible in `status()` counts and
recoverable only through the operator retry (`retry(kind, id)` or
`retryEligible(kind?)`) after the cause is corrected.

## Verified locally

- `test/connector.test.ts`: cutoff filtering, late-commit discovery, stable
  namespaced IDs across retries, tenant isolation, unsupported/malformed/
  missing-source outcomes, blocked identity handling, claim-expiry crash
  recovery, two instances sharing work under `FOR UPDATE SKIP LOCKED`, early
  lease release, graceful stop, and unchanged business acknowledgments.
- `test/schema-validation.test.ts`: the connector validates against the real
  `monetization/sql/001_monetization.sql` and interaction-orchestrator `sql/001`
  + `002` migrations, and reports missing relations/columns clearly.
- `test/authoritative-reconciliation.test.ts`: a synthetic billing event
  committed through `PostgresBillingStore.processStripeEvent` plus a real
  interaction window exercised end to end against a mocked Segment transport.
  Mocked transport is not vendor evidence.
- `channels/test/analytics.test.ts`: the channels ingestion route validates
  and forwards anonymous channel events to a mocked fetch.

## Unverified without credentials

No live Segment, GA4, or BigQuery access was available in this environment:
- Segment HTTP acceptance, the configured Segment→GA4 action mappings, and the
  Segment→BigQuery warehouse feed have not been exercised.
- `reconciliation/reconcile.sql` has not run against a real warehouse; run it
  with authorized snapshots and set `late_threshold` to the feed's configured
  delivery expectation.
- A deployed multi-instance database, production monitoring, and deletion
  propagation are not yet validated.

## Production app inspection

The adjacent Bears app uses `@portalshq/capability-identity` with the Auth
Gateway: `server/identity.ts` extracts a bearer token and resolves a verified
viewer. A host context module for the connector can compose the same packages
(channel/world registry for `resolveWorld`, the central identity store for
`resolveInteractionIdentity`); no such module is deployed yet, so the Bears
deployment would run billing-only.

Bears `server/index.ts` states that purchasing/grant delivery through the
monetization outbox is not wired there until Stripe checkout is configured, so
no billing events exist to deliver there either.

# Implementation validation — October 17, 2026

The Phase 2/3 implementation replaces the runtime stubs with a PostgreSQL lifecycle.
Validation was run locally; no production database, live payment, publication or
external Bears deployment was used.

## Verified

- Production TypeScript builds for orchestrator and monetization pass.
- Orchestrator source and test typechecks pass; monetization typecheck passes.
- The orchestrator suite passes 149 tests against PostgreSQL 17.6 in a disposable
  loopback-only instance using explicit `INTERACTION_TEST_MODE=non-production`.
  Every suite creates and drops its own random schema. The instance is stopped
  after verification.
- PostgreSQL coverage: 99.38% lines/statements, 99.30% functions, 97.09% branches.
  All four configured global 95% thresholds pass.
- Monetization's existing 96 tests pass.
- Package release validation passes: 43 packed files include the runtime entry,
  declarations and both schema migrations. Built ESM exports load successfully;
  there are no exported `Stub*` classes or unimplemented runtime methods.
- Formatting and whitespace checks pass for the changed orchestrator/monetization
  files, package index, changeset and CI workflow.

The tests exercise real SQL/migrations, atomic admission, retry conflicts, per-user
and guaranteed-slot limits, all policies, registered custom policies, review and
output decisions, credit allocation/capture/release/refund, revocation/expiry,
queue overflow, independent branch commits, concurrent resolution/cancellation,
shared monetization spending, multi-actor grant lock ordering, exact PostgreSQL
microsecond oldest-first ordering, transactional rollback, event replay/pagination,
transport failure recovery and subscription shutdown. The actual PostgreSQL fanout
implementation is exercised against its transport table.

The default PGlite path also exercises the real SQL in-process. It is supplemented
by PostgreSQL verification because its single connection serializes transactions.
The CI workflow runs the coverage suite with a PostgreSQL 17 container.

## External acceptance still required

The external Bears Live App is absent from this checkout. Its identity routing,
existing charged guide data, provider credentials, real entitlement configuration,
external world-store conflict checks and staging cutover cannot be certified here.
The migration guide describes the necessary application acceptance and rollback.
Execution adapter tests use controlled implementations; real providers must support
the documented durable dispatch keys and private-preview/publication contract.

Billing policies here use actual monetization credit grants. They do not manufacture
Stripe authorizations or perform fiat checkout/refunds. Text moderation implements
the configured rule policy; semantic and image/video inspection require a real
application/model adapter. The README states these contracts explicitly.

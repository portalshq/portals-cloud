# @portalshq/capability-interaction-orchestrator

## 0.3.0

### Minor Changes

- 31b4bb6: Replace interaction orchestration stubs with a transactional PostgreSQL lifecycle,
  seven arbitration policies, rating-based input/output moderation, credit holds and
  refunds, durable event replay, and idempotent execution dispatch. Apply the additive
  002 migration after the core and monetization schemas. Monetization now acquires
  grant locks in the same order as interaction billing while preserving oldest-first
  consumption.

### Patch Changes

- Updated dependencies [31b4bb6]
  - @portalshq/monetization@0.2.2

## 0.2.0

### Minor Changes

- 6dcac72: Replace interaction orchestration stubs with a transactional PostgreSQL lifecycle,
  seven arbitration policies, rating-based input/output moderation, credit holds and
  refunds, durable event replay, and idempotent execution dispatch. Apply the additive
  002 migration after the core and monetization schemas. Monetization now acquires
  grant locks in the same order as interaction billing while preserving oldest-first
  consumption.

### Patch Changes

- Updated dependencies [6dcac72]
  - @portalshq/monetization@0.2.1

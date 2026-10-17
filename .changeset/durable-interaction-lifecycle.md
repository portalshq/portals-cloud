---
"@portalshq/capability-interaction-orchestrator": minor
"@portalshq/monetization": patch
---

Replace interaction orchestration stubs with a transactional PostgreSQL lifecycle,
seven arbitration policies, rating-based input/output moderation, credit holds and
refunds, durable event replay, and idempotent execution dispatch. Apply the additive
002 migration after the core and monetization schemas. Monetization now acquires
grant locks in the same order as interaction billing while preserving oldest-first
consumption.

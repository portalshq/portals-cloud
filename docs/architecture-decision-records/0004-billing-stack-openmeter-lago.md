# ADR 0004: OpenMeter + Lago as the billing/metering stack

## Status
Accepted

## Context
The platform needs to support eight distinct monetization models (ranked
by lucrativeness in the platform strategy doc), spanning usage-based compute,
live-event per-participant, marketplace rake, creator revenue share,
persistence billing, enterprise subscriptions, royalty splits, and audience
graph API pricing. A single off-the-shelf SaaS billing tool can't model
all of these cleanly. Building from scratch is months of billing-specific
engineering that doesn't differentiate the platform.

## Decision
Two open-source tools, each owning a distinct layer:

**OpenMeter** (Apache 2.0, Go, Kafka + ClickHouse): raw usage metering.
- Receives CloudEvents from `@nap/billing-metering` in `runtime-core`
- Aggregates into 5 billable meters (capability-invocations, session-minutes,
  peak-concurrent-viewers, storage-written-bytes, marketplace-gmv-cents)
- Exposes usage query API consumed by `BillingSync`
- Chosen over building a custom metering pipeline: handles deduplication,
  tumbling-window aggregation, and backfill out of the box. Founded by ex-Netflix
  and ex-Stripe infrastructure engineers.

**Lago** (AGPL v3, Ruby API): billing engine + invoicing.
- Consumes OpenMeter aggregates via `BillingSync` CronJob (hourly)
- Applies pricing plans (`@nap/billing-engine/src/plans.ts`) against usage
- Generates invoices per tenant per billing cycle
- Pushes to Stripe for payment collection
- Chosen over Kill Bill: Lago is developer-first and usage-based-first;
  Kill Bill is more mature but Java, operationally heavier, and optimized
  for subscription billing at $250M+ ARR. Lago fits where we are now.

**Kill Bill** (Apache 2.0): noted as the graduate-to option at $10M+ ARR
when marketplace multi-tenant billing complexity warrants it. Specifically
better than Lago for complex B2B2C white-label marketplace scenarios with
thousands of tenants each having their own pricing catalogs.

**Stripe + Stripe Connect**: payment rail only. Lago drives billing logic
and pushes payment intents to Stripe. Stripe Connect handles marketplace
provider payouts at 0.25% + $0.25/transfer, which is absorbed by the
platform rake in `@nap/billing-marketplace`.

## NATS → Kafka gap
OpenMeter natively consumes Kafka. The existing platform infra uses NATS
JetStream. Resolution: control-plane metering events (session lifecycle,
capability invocations) use the `MeteringClient` HTTP client directly —
low volume, no Kafka needed. High-throughput fan-out events (viewer
joined/left at audience scale) go through a Redpanda Connect bridge
(see `infra/k8s/base/benthos-bridge.yaml`).

## Instrumentation boundary
`@nap/billing-metering` is imported ONLY by `@nap/runtime-core`. Capability
packages do not emit metering events. Capabilities report outputs through
their contracts; the runtime cross-cuts billing. This boundary must be
maintained in review — if a capability package ever imports billing-metering,
something went wrong with the abstraction.

## AGPL note on Lago
Lago's self-hosted version is AGPL v3. AGPL requires that if you distribute
a modified version of Lago over a network, you must release your modifications.
Since we're self-hosting Lago and not distributing it, AGPL doesn't require
open-sourcing the platform. However: legal should review before any scenario
where Lago is bundled into something distributed to customers rather than
operated as an internal service. Lago Cloud (their managed version) uses a
proprietary license and avoids the AGPL question if that becomes an issue.

## Consequences
- Every monetization model in the strategy doc now has a clear implementation
  path through this stack.
- BillingSync (hourly CronJob) is the coupling point between OpenMeter and
  Lago. If it fails, invoicing lags but the platform keeps running. Monitor it.
- Plan changes (rake rates, tier boundaries) are made in `plans.ts` and
  applied via the bootstrap script — never edit plans directly in the Lago UI.

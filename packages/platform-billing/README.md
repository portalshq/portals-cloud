# @portalshq/platform-billing

Usage metering and infrastructure invoicing for Portals **tenants**. Emits
billable events to OpenMeter and prices them through Lago.

This is the direction where the platform bills the tenant who built an
application. Audience-to-creator payments — where money flows from a viewer's
card to a creator's connected account — are `@portalshq/monetization`. The two
are siblings and share only `@portalshq/policy`.

## Credentials

Secrets are injected, never read from the environment by this package:

```ts
// application boundary
const apiKey = process.env.LAGO_API_KEY?.trim();
if (!apiKey) throw new Error("LAGO_API_KEY is not configured");

const lago = new LagoClient({ apiKey });
const sync = new BillingSync(lago, openMeterEndpoint);
const billing = createStripePlatformBilling(process.env.STRIPE_SECRET_KEY!.trim());
```

`LAGO_API_URL` and `OPENMETER_ENDPOINT` are non-secret and may be omitted in a
cluster, where the in-cluster defaults apply.

## What is here

| Module | Role |
|---|---|
| `MeteringClient` / `MeteringEvents` | The single instrumentation surface. Emits CloudEvents to OpenMeter. Never throws — metering must not block a session. |
| `BillingPlans` | Declarative Lago plan definitions. The source of truth for pricing. |
| `LagoClient` | Thin Lago HTTP client: customers, plans, usage, invoices. |
| `BillingSync` | CronJob seam. Queries OpenMeter per tenant per period and reports usage to Lago. Not on the hot path. |
| `StripePlatformBilling` | Stripe customer, Checkout, and portal helpers for the platform's own B2B sales flows. |
| `reportTenantRake` | Reports what the platform earned from a tenant's marketplace volume. |

## Meters you need to define in OpenMeter (one-time setup)

Create these in the OpenMeter UI or via API before first use:

| Meter ID | Event type | Aggregation | Tenant-billable |
|---|---|---|---|
| capability-invocations | capability.invoked | COUNT | yes |
| session-minutes | session.ended | SUM(durationSeconds/60) | yes |
| peak-concurrent-viewers | session.ended | MAX(peakConcurrentViewers) | yes |
| storage-written-bytes | storage.written | SUM(bytes) | yes |
| marketplace-gmv-cents | marketplace.transaction | SUM(grossAmountCents) | **no** |

`marketplace-gmv-cents` is the basis for the platform's own rake, not a cost to
the tenant, so `BillingSync` deliberately does not report it for tenant
invoicing. Rake is settled on the payout side in `@portalshq/monetization`.

## Why this depends on `@portalshq/policy`

Rake rates have exactly one table, and it lives in `@portalshq/policy` because
both sides of the money need it: the payout side charges it, and this package
reports it. `reportTenantRake` reads the same numbers the payout path settles
with, so the two cannot disagree about a rate.

## Bootstrapping Lago

`infra/compose/lago/seed.sh` creates the plans defined in `src/plans.ts` against a
Lago API. It is idempotent — Lago returns 422 on duplicate codes, treated as
success. Run it after Lago starts. In a cluster the equivalent is a one-shot job
calling the same API.

`BillingSync` expects a K8s CronJob (`infra/k8s/base/billing-sync-cronjob.yaml`)
or the compose `billing-sync` service.

## Instrumentation boundary

`MeteringClient` is the only emission surface. Capability packages must not emit
metering events — they report outputs through their contracts and the runtime or
application emits the billable event. See
[ADR 0004](../../docs/architecture-decision-records/0004-billing-stack-openmeter-lago.md).

## AGPL note on Lago

Lago self-hosted is AGPL v3. Self-hosting it as an internal service does not
require releasing the platform, but legal should review any scenario where Lago
is bundled into something distributed to customers. Lago Cloud avoids the
question.

## Breaking changes in 0.0.5

Renamed from `@portalshq/billing-metering` and `@portalshq/billing-engine`, which
are now a single package. `MeteringClient`, `MeteringEvents`, `BillingPlans`,
`LagoClient`, and `BillingSync` keep their names.

`StripePlatformBilling` moved here from `@portalshq/billing` (now
`@portalshq/monetization`): it serves the platform's own B2B flows, not audience
monetization.

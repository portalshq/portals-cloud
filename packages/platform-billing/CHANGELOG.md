# @portalshq/platform-billing

## 0.0.5

### Patch Changes

- Merged `@portalshq/billing-metering` and `@portalshq/billing-engine` into one
  package, and absorbed `StripePlatformBilling` from the former
  `@portalshq/billing`. Metering and invoicing are a matched pair; splitting them
  meant two installs for one feature.
  See
  [ADR 0009](../../docs/architecture-decision-records/0009-billing-package-boundaries.md).
  `MeteringClient`, `MeteringEvents`, `BillingPlans`, `LagoClient`, and
  `BillingSync` keep their names and are now importable from one entry point.

- **`marketplace-gmv-cents` is no longer reported as tenant-billable usage.**
  `BillingSync` queried it and pushed it to Lago per tenant, but no plan priced
  it. It is the basis for the platform's own rake, so invoicing it would have
  charged the tenant for the platform's revenue. It is now excluded from the
  tenant meter list and documented in `plans.ts`.

- Added `@portalshq/policy` as a dependency and a `reportTenantRake` helper, so
  the platform's take is reported against the same rate table the payout side
  settles with.

- Corrected `plans.ts`, which pointed at `../billing-engine/src/bootstrap.ts` — a
  file that never existed. The bootstrap is `infra/compose/lago/seed.sh`.

- Dropped the unused `@portalshq/contracts` dependency; it was declared but never
  imported.

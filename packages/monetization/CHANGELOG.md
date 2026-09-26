# @portalshq/monetization

## 0.2.0

### Major Changes

- Renamed from `@portalshq/billing`. The name described marketplace payouts,
  but every consumer imported `StripePlatformBilling` for the platform's own B2B
  flows. See
  [ADR 0009](../../docs/architecture-decision-records/0009-billing-package-boundaries.md).

- **Money is now keyed on the tenant, not the channel.** A tenant builds and
  launches one or more applications and holds one connected account, so a tenant
  running three channels onboards once and is paid once. `channelId` remains on
  the purchase as attribution for per-application rollup.
  - `ChannelBillingProfile` → `TenantBillingProfile`, keyed on `tenantId`.
  - `ChannelPurchase` → `Purchase`, with `tenantId`, optional `sessionId`, and
    `settledAt` added.
  - `createChannelCheckout` → `createCheckout`; `ensureChannelProfile` →
    `ensureTenantProfile`; `getChannelProfile` → `getTenantProfile` and the
    corresponding `BillingStore`/`BillingTransaction` methods.
  - `PortalsBilling` → `Monetization`.
  - Checkout metadata `schemaVersion` is `2`.

- **Schema is replaced, not migrated.** `sql/001_monetization.sql` supersedes
  `sql/001_billing.sql`; all `billing_*` tables become `monetization_*`. No
  production data existed against the Connect path, so nothing required
  migrating. The purchase table gains indexes for tenant-level and
  per-application rollup.

- **The platform owns the fee.** `CreateCheckoutInput` has no fee field, so
  `application_fee_amount` is read from the server-side catalog and cannot be
  influenced by a caller. The platform creates the charge, which makes this
  structural rather than merely conventional. `verifySettlement` re-checks the
  recorded amount and fee as defense in depth.
- `CreateCheckoutInput` gains an optional `customerId` for the end user's
  platform-account `Customer`. Customers and payment methods live on the platform
  so one payment method is reused across every tenant a consumer pays — a
  `PaymentMethod` does not move between connected accounts, so this is why
  destination charges are used.
- `reverseTransferForDispute` is retained: `losses_collector: "application"` is
  required for destination charges so a dispute transfer can be reversed.
- **Added entitlements.** A tenant configures rules; a rule names a subset of
  scope dimensions and the dimensions present are both the matcher and the
  lifetime. Grants are balances, not flags — a rule nothing consumes stays
  permanently available. Rules are evaluated off the existing settlement outbox,
  which now carries `tenantId`, `sessionId`, `productKey`, and `settledAt`.
  New: `EntitlementRule`, `EntitlementGrant`, `EntitlementScope`,
  `EntitlementStore`, `InMemoryEntitlementStore`, `PostgresEntitlementStore`,
  `ruleMatches`, `grantsForSettlement`, `grantAppliesAt`, `validateRule`.

### Minor Changes

- Added test coverage for the settlement path, which previously had none:
  outbox fact completeness, webhook idempotency under redelivery, tenant
  routing independent of source channel, cumulative partial refunds, and 25
  entitlement cases.

### Patch Changes

- `StripePlatformBilling`, `createStripePlatformBilling`, and
  `createStripePlatformClient` moved to `@portalshq/platform-billing`.
- `StripeConnectClient` moved here from the former `@portalshq/billing-marketplace`.
- Replaced the local `createStripePlatformClient` import with a dedicated
  `stripe-client` module.
- Dropped the unused `@portalshq/contracts` dependency inherited from the
  billing cohort; it was declared but never imported.

## 0.1.2

### Patch Changes

- a03f1cf: Move reusable live application domains into Portals packages: monotonic tick timing and countdowns, bounded ordered content preparation, isolated realtime fanout, scheduled live delivery and reusable HLS playback, plus Stripe platform and Connect channel billing.

# @portalshq/monetization

**Reusable agent module:** [integration guide](../../docs/package-agents/monetization.md)

Audience-to-creator payments: Stripe Connect destination charges, tenant payout readiness, a PostgreSQL ledger/outbox, and rule-based entitlements.

A **tenant** is a producer, independent of the audience users who are consumers.
A **channel** is the producer venue; a **program** is the software experience
owned by a channel. Attribute application activity and entitlement kinds to the
program ID. A central `tenants` registry can identify producers without a user
foreign key.

The current package and vendored SQL still use `tenant_id` for payout profiles,
purchases and entitlement records. It is a required package key, not a newly
introduced `program_id` column. An integration that uses a program ID in this
field must provision the corresponding payout profile and Stripe mapping and
coordinate all purchase, rule and grant keys. Do not reassign existing tenant
keys, Stripe accounts or grant kinds without an explicit data migration. A
program-prefixed entitlement kind isolates a program because the entitlement
store filters by consumer and kind.

## Required setup

1. Apply `sql/001_monetization.sql` to PostgreSQL.
2. Create `PostgresBillingStore` and `PostgresEntitlementStore` from the same pool.
3. Inject a server-side Stripe platform client, server-owned `BillingCatalog`, and `IdGenerator` into `Monetization`.
4. Create/refresh the tenant profile and complete Stripe onboarding before checkout.
5. Route the **raw, unparsed** Stripe webhook body to `handleWebhook`, then run `MonetizationDispatcher.drainOnce()` from a worker.

```ts
const monetization = new Monetization({ stripe, store, catalog, ids });
const { url } = await monetization.createCheckout({
  purchaseId, tenantId, channelId, buyerId, productKey, successUrl, cancelUrl,
});
```

## Core API

- `ensureTenantProfile()`, `refreshTenantCapabilities()`, `createConnectOnboardingLink()`: provision and assess the tenant's Stripe Connect recipient account.
- `ensureBillingCustomer()`, `createCheckout()`: create platform-held customer/payment flows. `purchaseId` is the idempotency key and cannot be reused for different purchase facts.
- `handleWebhook(rawBody, signature, secret)`: atomically applies Stripe events to purchases, ledger, and outbox. Use `refundPurchase()` for refunds.
- `MonetizationDispatcher`: drains the outbox, applies entitlements, and invokes optional application side effects. Monitor `isStale()`, `listParked()`, and requeue repaired events with `requeueParked()`.
- `PostgresEntitlementStore.consume()` / `remaining()`: consume or inspect entitlement balances.
- `debitCredits(input)` / `grantCredits(input)` (`CreditDebitStore` / `CreditGrantStore`): retry-safe credit operations keyed by an immutable `operationId`. The debit locks grants, verifies tenant/consumer/kind/scope, debits in deterministic order, and persists the outcome (including `insufficient`, so a later balance cannot charge a declined operation). The grant issues reward/courtesy credits as a non-purchase-backed grant under a `credit-grant:<kind>` rule and records it in `monetization_credit_grants`. Identical retries replay the stored result; a reused operation id with different facts is an idempotency conflict. Apply `sql/002_credit_debits.sql` and `sql/003_credit_grants.sql`.

## Safety and operations

- Keep Stripe keys, webhook secrets, catalog pricing, fee amounts, and destination account IDs server-side. The catalog is authoritative; browser inputs must never set price or fee.
- Verify webhook signatures before responding; preserve the exact raw request body.
- Destination charges make the platform the losses collector. Configure and review dispute reversal policy (`reverseTransferForDispute`) before production.
- A settlement without `sessionId` cannot match session-scoped entitlement rules. Alert on a non-zero `withoutSession` drain result.
- This package is tenant-keyed. It is not for platform B2B subscriptions; use `@portalshq/platform-billing` for those.

### Lock ordering with interaction credit holds

`PostgresEntitlementStore.consume` locks grants by ID and then consumes the oldest
matching grants first. The interaction orchestrator uses the same grant lock order
for reservations, captures and refunds. Deploy these package updates together when
sharing a PostgreSQL entitlement database.

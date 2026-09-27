# @portalshq/monetization

**Reusable agent module:** [integration guide](../../docs/package-agents/monetization.md)

Audience-to-creator payments: Stripe Connect destination charges, tenant payout readiness, a PostgreSQL ledger/outbox, and rule-based entitlements.

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

## Safety and operations

- Keep Stripe keys, webhook secrets, catalog pricing, fee amounts, and destination account IDs server-side. The catalog is authoritative; browser inputs must never set price or fee.
- Verify webhook signatures before responding; preserve the exact raw request body.
- Destination charges make the platform the losses collector. Configure and review dispute reversal policy (`reverseTransferForDispute`) before production.
- A settlement without `sessionId` cannot match session-scoped entitlement rules. Alert on a non-zero `withoutSession` drain result.
- This package is tenant-keyed. It is not for platform B2B subscriptions; use `@portalshq/platform-billing` for those.

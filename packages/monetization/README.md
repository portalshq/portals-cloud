# @portalshq/monetization

Audience-to-creator monetization for Portals. Stripe Connect destination
charges, entitlements, a ledger, and a transactional outbox.

Applications provide authorization, catalog configuration, persistence, and
URLs. They never provide authoritative prices, fees, or destination account ids
from a browser.

## Credentials

No package here reads `process.env` for a secret. The application boundary
resolves the credential and injects it, so a library can never quietly pick up
an ambient key and tests cannot be influenced by one.

```ts
// application boundary — the only place env is read
const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not configured");

const monetization = new Monetization({
  stripe: createStripePlatformClient(secretKey),
  store, ids, catalog,
});
const transfers = new StripeConnectClient(secretKey);
```

Store it in the deploy platform's secrets vault (AWS Secrets Manager, GCP Secret
Manager, Azure Key Vault), or a write-only environment variable where no vault
exists — Vercel, for instance, has no built-in vault. Never in source.

### Credentials

`stripe` is the platform's charge-capable key: it creates charges and transfers
them to tenants, and it holds the end users' payment methods. Use a **restricted
key** scoped to only the endpoints used, plus an IP access policy. Prefer the
deploy platform's secrets vault over a plain environment variable.

| Credential | Acts on | Purpose |
|---|---|---|
| **Platform RAK** (`rk_`) | Platform account, all connected accounts | Creates charges and transfers; provisions tenant accounts; reads capabilities; creates onboarding links |
| **Platform-sales RAK** (`rk_`) | Platform account | Enterprise and B2B sales, no Connect involved. Served by `StripePlatformBilling` in `@portalshq/platform-billing` |

End users never hold a Stripe credential, and neither do tenants. Tenants get
Stripe-hosted onboarding plus dashboard access via account links the platform
creates.

## Checkout

Pass a stable application order id as `purchaseId`. Retrying that id returns the
existing Stripe Checkout Session; reusing it for different purchase data is
rejected. Checkout is refused until the tenant can receive payouts.

```ts
const { url } = await monetization.createCheckout({
  purchaseId, tenantId, channelId, sessionId, buyerId, productKey,
  successUrl, cancelUrl,
});
```

`sessionId` is optional. When present it becomes a fact that session-scoped
entitlement rules can match on.

## Webhooks, refunds, disputes

`handleWebhook` processes signed events transactionally: the event is claimed
atomically, so a redelivered event is a no-op and a settlement can never be
applied twice. Refund webhooks are applied as cumulative Stripe state and
ledger only the new delta. To recover tenant funds after a dispute, provide
`reverseTransferForDispute`; an approved reversal uses the recorded Connect
transfer and a stable Stripe idempotency key. Webhook effects and outbox writes
commit in one `BillingStore` transaction.

## Entitlements

An entitlement is a grant made to a paying end user, configured by the tenant.
The scope is an arbitrary subset of dimensions, and **the dimensions present are
both the matcher and the lifetime**:

| Scope | Meaning |
|---|---|
| `{ channelId }` | valid for the life of the channel |
| `{ channelId, sessionId }` | valid only during that session |
| `{ channelId, date }` | only for purchases settling that day; expires at end of it |
| `{ channelId, sessionId, date }` | the narrowest form |

Every dimension a rule names must match for the grant to be made. A grant is
always made to a consumer, so a rule never grants "the channel" anything.

## Wiring: one construction, nothing to remember

`MonetizationDispatcher` is the intended entry point for outbox delivery, and it
wires entitlement handling for you:

```ts
const dispatcher = new MonetizationDispatcher({
  store: new PostgresBillingStore(pool),
  entitlements: new PostgresEntitlementStore(pool),   // required
  ids: { next: () => randomUUID() },
  onEvent: (event, applied) => {
    // your own side effects, e.g. publish a settled superchat to the live chat
    if (event.type === "billing.purchase_settled") publishToChat(event.payload);
  },
});

// on a schedule — a worker, a cron, or a loop
const { delivered, failed, granted, revoked, withoutSession } = await dispatcher.drainOnce();
```

**Entitlement handling is unconditional.** `onEvent` is the optional part. There
is no configuration in which a settled purchase silently fails to grant, because
the alternative — constructing a `BillingOutboxDispatcher` and pointing its
`publish` at `applySettlementEvent` — is a step whose omission produces no error.
Use that path only if you are deliberately building your own delivery loop.

`drainOnce` returns per-drain counters, not a running total. `withoutSession`
counts settlements that arrived with no `sessionId`: a purchase with no session
cannot match a session-scoped rule, so a non-zero count means either
`sessionId` is not being passed at checkout, or sessions are unused. Both are
worth seeing rather than inferring from a rule that never matches.

A worker that stops is indistinguishable from a quiet platform, so:

```ts
if (dispatcher.isStale()) alert("monetization outbox is not draining");
```

Grants are **balances, not flags**. A rule nothing ever consumes stays
permanently available, which is how a standing membership is expressed; a rule
the application spends one unit at a time is how a single-use unlock is
expressed. Both use the same primitive:

```ts
const store = new PostgresEntitlementStore(pool);

await store.consume(consumerId, "prompt_influence", { channelId, sessionId }, 1);
await store.remaining(consumerId, "founding_member", { channelId });
```

Rules are evaluated off the settlement outbox, so `billing.purchase_settled`
carries every fact a rule can match on. Grants are keyed `(rule_id, purchase_id)`,
so a redelivered event cannot double-grant. `purchase_refunded` and
`purchase_disputed` revoke what a purchase created.

## Persistence

`PostgresBillingStore` (purchases, ledger, outbox) and
`PostgresEntitlementStore` (rules, grants) are the provided adapters. Apply
`sql/001_monetization.sql` first. Both sit behind small ports, so an application
already using an ORM can implement them without `pg`.

## Breaking changes in 0.2.0

Renamed from `@portalshq/billing`. Money is now keyed on `tenantId` rather than
`channelId`, so the `billing_*` tables are replaced rather than migrated —
`sql/001_monetization.sql` is the new baseline. `ChannelBillingProfile` is now
`TenantBillingProfile`, `createChannelCheckout` is `createCheckout`, and
`ChannelPurchase` is `Purchase`. No production data was written against the
Connect path before this release, so nothing required migrating.

**Accounts v2 replaced the deprecated v1 accounts API**, and destination charges
were retained (see "Destination charges, and why"):

- `ensureTenantProfile` calls `stripe.v2.core.accounts.create` with a merchant
  configuration. The deprecated `stripe.accounts.create({ type: "express" })`
  form is not used anywhere.
- Capability state is read from
  `configuration.recipient.capabilities.stripe_balance.stripe_transfers.status`.
  The v1 fields `charges_enabled`, `payouts_enabled`, and `details_submitted` are
  gone, as are their columns.
- `TenantBillingProfile` drops `stripeCustomerId` and the three v1 booleans,
  gaining `stripeAccountId` and `transfersStatus`.
- `createConnectOnboardingLink` uses the v2 `accountLinks` resource.
- `createCheckout` sets `transfer_data.destination` and `integration_identifier`,
  and accepts an optional `customerId` for the platform-held end user.
- New: `verifySettlement`, `refreshTenantCapabilities`, `SettlementVerification`.
- Checkout metadata `schemaVersion` is `3`.

`StripePlatformBilling` and `createStripePlatformBilling` moved to
`@portalshq/platform-billing`; they serve the platform's own B2B flows, not
audience monetization.


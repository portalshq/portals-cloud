# ADR 0009: Billing package boundaries — two directions of money

## Status
Accepted (supersedes the package layout described in ADR 0004)

## Context

Four packages existed under billing names that implied a hierarchy they did not
have:

- `@portalshq/billing` (726 src LOC) — Stripe Connect destination charges,
  ledger, transactional outbox, Postgres store. 339 of those LOC were the
  `PortalsBilling` class and its store, dispatcher, and types. **None of it was
  reachable from the package's own index-adjacent consumers.**
- `@portalshq/billing-metering` (208) — CloudEvents → OpenMeter.
- `@portalshq/billing-engine` (236) — Lago HTTP client, plan definitions, and the
  OpenMeter→Lago sync CronJob.
- `@portalshq/billing-marketplace` (227) — rake rates and lineage royalty splits.

Three facts drove the reorganisation.

**1. The names implied a facade stack that did not exist.** The four were four
unrelated systems. A builder asking "where do I add monetization?" got four
plausible answers and no way to choose.

**2. `@portalshq/billing` was named for a half nobody used.** Its README
described "Stripe platform billing and Connect payouts for Portals channels." In
practice every consumer imported `StripePlatformBilling` — a 53-line
passthrough for the platform's *own* B2B sales flows (pilot, studio-annual,
production-team). The Connect half, 547 of 726 LOC, had no consumer in the
repository. So the package was named for the audience-monetization story while
being used for the platform-billing story.

**3. Money was keyed on the wrong entity.** `billing_channel_profiles` was keyed
`channel_id text PRIMARY KEY`, and purchases carried a foreign key to it. But a
tenant builds and launches one or more applications, and the requirement is
tenant-level tracking of superchats and other purchases *across* those
applications. A tenant with three applications would have onboarded three
connected accounts, produced three KYC sets, and been paid three times.

## Decision

Split on the two directions of money, and make the rate table a leaf both can
depend on.

```
                    @portalshq/policy
                  (pure, zero dependencies)
                     ╱                  ╲
    @portalshq/monetization      @portalshq/platform-billing
    audience → creator           Portals → tenant
```

**`@portalshq/monetization`** (was `@portalshq/billing`) — Connect destination
charges, ledger, outbox, Postgres store, and tenant-configured entitlements.
Money is keyed on `tenantId`; `channelId` is attribution on the purchase, which
gives per-application rollup without fragmenting the payout.

**`@portalshq/platform-billing`** (was `@portalshq/billing-metering` +
`@portalshq/billing-engine`, plus `StripePlatformBilling`) — usage metering and
tenant infrastructure invoicing. The metering client and the Lago client are a
matched pair: separating them meant two installs to get one feature.

**`@portalshq/policy`** (was `@portalshq/billing-marketplace`) — standalone, not a
subpath export. Rake rates are needed by both sides: the payout side charges
them, and platform-billing reports the platform's take against them. A subpath
of `monetization` would have forced `platform-billing` to depend on the money
package for a number. It is pure and has zero dependencies, so it is safe for
both.

Stripe transport stayed out of `policy`: `StripeConnectClient` moved to
`monetization` with the rest of the Connect boundary.

### Connect is retained

A channel charging its own audience is exactly the case Connect destination
charges exist for: the money belongs to the entity that made the content, and
`reverse_transfer` on refund and dispute only works when there is a separate
destination account. The defect was the entity keying, not Connect. `platformFeeAmount`
therefore stays required rather than becoming optional.

### `marketplace-gmv-cents` is not tenant-billable

`BillingSync` queried this meter and reported it to Lago per tenant, but no plan
priced it. It is the basis for the platform's own rake, so invoicing it to a
tenant would have charged the tenant for the platform's revenue. It is now
explicitly excluded from the tenant meter list and documented as such in
`plans.ts` and the package README.

### Entitlements

An entitlement is a grant made to a paying end user, configured by the tenant,
not the platform. The scope is a subset of dimensions and **the dimensions
present are both the matcher and the lifetime** — `{channelId}` lives with the
channel, `{channelId, sessionId}` dies with the session, adding `date` bounds it
to a day. Every named dimension must match.

Grants are balances, not flags. A rule nothing consumes stays permanently
available, which is how a standing membership is expressed; a rule the
application spends one unit at a time is a single-use unlock. One primitive.

Rules are evaluated off the existing settlement outbox rather than a new event
pipeline. This required the outbox payload to carry `tenantId`, `sessionId`,
`productKey`, and `settledAt`, so a rule is evaluable without re-reading the
purchase. `schemaVersion` on the checkout metadata moved to `2` to match.

## Consequences

- A tenant with N applications onboards one connected account and is paid once.
- The rate table has one home, so the payout and reporting sides cannot disagree.
- `sql/001_monetization.sql` replaces the `billing_*` tables rather than migrating
  them. No production data existed: the Connect path had no consumer, so nobody
  had applied the old DDL.
- `@portalshq/billing` and the three other old names are **not** re-exported as
  deprecated shims. Consumers are adjusted in place. `@portalshq/billing` was
  0.1.2 and the rename is the documented breaking change in 0.2.0.
- `StripePlatformBilling` reaching 7+ call sites in `cloud/frontend` and 1 in
  `massively-social-ebook` was treated as a signal that the platform story
  deserved a real home, not as evidence the package worked.
- `policy` has no tests, and neither does `platform-billing`. Both are recorded
  in the package README's known-gaps list.

## Corrections made alongside this

ADR 0004 contained two claims that were false and are now restated in place:

- It stated that `billing-metering` was imported *only* by `runtime-core` and
  instructed reviewers to reject any other importer. `runtime-core` declared no
  dependencies and emitted nothing; application code imported the client
  directly. The boundary that actually holds, and is now the one enforced, is
  narrower: capability packages must not emit metering events.
- Twelve `@px/*` references survived the earlier rename to `@portalshq/*`,
  including in five Kubernetes manifests and `docker-compose.yml`, despite
  `IMPLEMENTATION_PLAN.md` claiming the sweep was complete.

`plans.ts` also pointed at `../billing-engine/src/bootstrap.ts`, which never
existed. The real bootstrap is `infra/compose/lago/seed.sh`.

## Amendment: the charge pattern, settled

This amendment supersedes two earlier drafts of itself, which are described
below so the reasoning is not re-derived from scratch.

### Why destination charges

A requirement settled the question: **an end user must be able to provide payment
details once and reuse them across every tenant they pay.** Asking a consumer to
re-enter a card for each channel is unacceptable, and the product is worthless
without it.

That requirement decides the charge pattern, because it decides where the
`Customer` and `PaymentMethod` live.

Under direct charges the seller owns the customer relationship. Each tenant
account holds its own `Customer`, and a `PaymentMethod` does not transfer between
accounts. A consumer paying tenant A and then tenant B would be asked for payment
details twice. There is no supported way around this without holding the payment
method on the platform, which is the destination-charge topology.

Under destination charges the platform owns the `Customer` and the saved payment
method, the charge is created on the platform account, and funds auto-transfer to
the tenant. One payment method, any tenant. This is the marketplace model Stripe
documents, and the shape used by marketplaces generally.

### Decision

Connected accounts are created via Accounts v2 as a **recipient**, with
`dashboard: "express"` and
`responsibilities: { fees_collector: "application", losses_collector: "application" }`.
`CreateCheckoutInput` takes an optional `customerId` for the end user's
platform-account `Customer`, populated from a `SetupIntent`.

### The accepted cost

`losses_collector: "stripe"` is **blocked** with destination charges, and
`"application"` is *required* for dispute transfer reversals. So the platform is
merchant of record and carries negative-balance and dispute liability across all
tenant volume. This is the price of reusable payment methods and it is not
avoidable in this model. It must be reflected in the rake or provisioned for.

`reverseTransferForDispute` is therefore retained: recovering tenant funds after a
dispute means reversing the Connect transfer.

### The platform owns the fee

Because the platform creates the charge, `application_fee_amount` is under the
platform's control by construction, not by convention. `CreateCheckoutInput` has
no fee field; the value comes from `catalog.resolve()` on the server.
`verifySettlement` re-checks what Stripe recorded as defense in depth.

### Credentials

| Credential | Acts on | Purpose |
|---|---|---|
| Platform RAK (`rk_`) | Platform account and all connected accounts | Creates charges and transfers, provisions tenant accounts, reads capabilities, creates onboarding links |
| Platform-sales RAK (`rk_`) | Platform account | Enterprise and B2B sales, no Connect |

Neither end users nor tenants hold a Stripe credential. End users' payment methods
live on the platform account and are never exposed to a tenant.

### Corrected reasoning

Two intermediate conclusions in this ADR were wrong and are corrected here:

- **Merchant of record is not the caller.** A platform credential creating a
  PaymentIntent in a tenant's connected account is still a direct charge with the
  tenant as merchant of record. MoR follows the account the charge lands on, not
  which key made the call.
- **Fee ownership and payment-method ownership are separate.** A draft concluded
  that the platform could own the fee only by taking a tenant-scoped credential
  and making the tenant create the charge. That inverted both problems: it handed
  the caller control of `application_fee_amount`, and it put the `Customer` on the
  tenant's account, which is precisely what forces a consumer to re-enter payment
  details per tenant. Destination charges satisfy both requirements at once.

### Consequences

- One saved payment method serves every tenant, which is the product requirement.
- The platform is merchant of record and carries dispute liability. Priced in.
- A platform billing endpoint remains the right tool for untrusted third-party
  builders, who should never hold a credential, and for enforcement a credential
  cannot provide: catalog allow-lists, spend caps, rate limits, audit. Most of
  those operations are already asynchronous through the outbox.
- Recurring billing across tenants is a harder problem than one-time destination
  charges and is not addressed here. `SetupIntents` and the v2 customer
  configuration are the documented starting point when a tenant wants
  subscriptions.

# Monetization: internal working notes

Internal record of the `@portalshq` monetization work: what was decided, what
shipped, what is outstanding, and which judgement calls are still open. External
documentation lives in each package's README; this file is for the reasoning and
the open threads.

Last updated: 2026-09-25.

## Domain model

Three distinct entities. Conflating any two of them caused rework.

| Entity | Role |
|---|---|
| **tenant** | Builds and launches one or more applications. Holds one Connect account. Receives money. |
| **channel** | A deployed application belonging to a tenant. Attribution only. |
| **consumer** | An end user who pays. Distinct from a tenant. |

Money is keyed on `tenantId`. A tenant running three channels onboards once and is
paid once; each purchase records the `channelId` it came from for per-application
rollup. This replaced an original design that keyed billing profiles on
`channelId`, which would have produced three Connect accounts per tenant.

## Package layout

Split on the two directions of money. `monetization` is the only package that
moves tenant money.

```
              @portalshq/policy
            (pure, zero dependencies)
               ╱                ╲
 @portalshq/monetization    @portalshq/platform-billing
 audience → tenant          Portals → tenant (infrastructure)
```

| Package | Purpose | Tests |
|---|---|---|
| `monetization` | Connect destination charges, ledger, outbox, tenant-configured entitlements | 65 |
| `policy` | Rake rates, lineage royalty splits. Pure, zero deps | none |
| `platform-billing` | OpenMeter emit → Lago tenant invoicing, `StripePlatformBilling` for B2B | none |

Absorbed during the reorganisation: `billing` → `monetization`;
`billing-marketplace` → `policy`; `billing-metering` + `billing-engine` +
`StripePlatformBilling` → `platform-billing`. Hard switch, no deprecated
re-export shims — consumers were adjusted in place. Recorded in
[ADR 0009](../../docs/architecture-decision-records/0009-billing-package-boundaries.md).

## Charge pattern: destination charges, settled

**Requirement:** an end user provides payment details once and reuses them across
every tenant they pay. Asking for a card per channel is unacceptable.

That decided the charge pattern, because it decides where the `Customer` lives.
Under direct charges each tenant account holds its own `Customer` and a
`PaymentMethod` does not move between accounts, so a consumer would repay per
tenant. Destination charges keep the `Customer` and saved payment method on the
platform account and transfer funds to the tenant on success.

**Accepted cost:** `losses_collector: "stripe"` is blocked with destination
charges, and `"application"` is *required* so a dispute transfer can be reversed.
The platform is merchant of record and carries negative-balance and dispute
liability across all tenant volume. **This needs a commercial and legal decision
before volume.** It is not an engineering decision and it is not avoidable in this
model.

**Reverted twice during this work.** The charge pattern was switched to direct
charges, then back. Two intermediate conclusions were wrong and are recorded in
ADR 0009 so they are not re-derived:

- Merchant of record follows the account the charge lands on, not which key made
  the call. A platform key creating a PaymentIntent in a tenant's account is still
  a direct charge.
- Fee ownership and payment-method ownership are separate problems. Solving the
  first by giving the caller a tenant-scoped credential broke the second.

## Credentials

Two keys, both restricted (`rk_`) rather than secret (`sk_`).

| Credential | Acts on | Purpose |
|---|---|---|
| Platform RAK | Platform account, all connected accounts | Creates charges and transfers, provisions tenant accounts, reads capabilities, creates onboarding links |
| Platform-sales RAK | Platform account | Enterprise and B2B, no Connect. Served by `StripePlatformBilling` in `platform-billing` |

End users and tenants hold no Stripe credential. No package reads a secret from
`process.env`; injection is the only path, so a library can never pick up an
ambient key and tests cannot be influenced by one.

Provisioning a tenant inherently requires a key that is global, so the platform
key is always cross-tenant. It cannot be scoped per tenant. It cannot move money
under the recommended endpoint list, but it can read and mutate every tenant's
capabilities and onboarding state — keep its endpoint list minimal and give it an
IP access policy.

## Entitlements

Tenant-configured rules. A grant is made to a `consumerId`; a rule never grants
"the channel" anything.

**The scope is a subset of dimensions, and the dimensions present are both the
matcher and the lifetime:**

| Scope | Lifetime |
|---|---|
| `{ channelId }` | life of the channel |
| `{ channelId, sessionId }` | that session only |
| `{ channelId, date }` | purchases settling that day; expires at end of it |
| `{ channelId, sessionId, date }` | narrowest form |

Every named dimension must match.

**Grants are balances, not flags.** A rule nothing consumes stays permanently
available, which is how a standing membership is expressed. A rule the
application spends one unit at a time is a single-use unlock. One primitive:
`grant` / `consume` / `remaining` / `revokeForPurchase`. There is no sentinel for
"permanent" — permanence is emergent from never being consumed.

Grants key `(rule_id, purchase_id)`, so a redelivered settlement outbox event
cannot double-grant.

**Wiring.** `MonetizationDispatcher` is the intended entry point and wires
entitlement handling unconditionally; the developer's `onEvent` is the optional
part. It grants on `billing.purchase_settled` and revokes on
`purchase_refunded` / `purchase_disputed`.

This exists because of how the "entitlements were never wired" bug happened. The
first design shipped `applySettlementEvent` correctly but required the developer
to construct a `BillingOutboxDispatcher` and point its `publish` at it. That step
was documented, and the omission still produced **no error** — entitlements
simply never granted. A silent missing-behaviour bug is the worst class there is,
and it is an API-shape problem, not a documentation problem. The fix was to make
the correct wiring the shortest path, so forgetting is not expressible.

Two related silent-failure paths are also covered:

- A settlement that cannot be evaluated (missing `tenantId`, bad amount) now
  **fails delivery** and is retried, rather than being marked delivered.
- A settlement with no `sessionId` is counted in the drain result and logged,
  because a session-scoped rule that never matches is otherwise invisible.

A stopped worker is indistinguishable from a quiet platform, so `isStale()` is
provided for a health check.

## Out of scope

**Tenant subscriptions / recurring billing.** Explicitly deferred. Materially
harder than one-time destination charges: the connected account needs the v2
customer configuration, and `customer_account` must be passed on the
SetupIntent and subscription calls. Do not treat a one-time superchat flow as
evidence that subscriptions work — they do not, yet. Revisit with its own ADR
when a tenant actually asks.

Also deferred: the platform billing endpoint for untrusted third-party builders
(entitlement lives here in the package, and the enforcement an endpoint adds is
catalog allow-lists, spend caps, rate limits, audit — most of those operations are
already asynchronous through the outbox).

## Bugs found and fixed in this work

Recorded because each was a real defect in shipped code, and several compiled and
passed tests while being wrong.

1. **Deprecated v1 accounts API.** `stripe.accounts.create({ type: "express" })`
   and the `charges_enabled` / `payouts_enabled` / `details_submitted` booleans
   are all deprecated. Now `stripe.v2.core.accounts` with
   `configuration.recipient`. The SDK supports both forms, so typecheck and tests
   passed throughout.
2. **`stripe_transfers` never requested.** `configuration: { recipient: {} }` is
   structurally valid but omits the required
   `capabilities.stripe_balance.stripe_transfers.requested`, so the capability
   would never activate and **every checkout would be rejected**. A showstopper
   that typechecked.
3. **Money moved inside a DB transaction.** `transfers.createReversal` ran inside
   `processStripeEvent`, so a failed commit could leave a reversal with no ledger
   entry, and a failed reversal could roll back the dispute record. The reversal
   now happens before the transaction under a stable idempotency key, so a retry
   returns the original reversal.
4. **`FOR UPDATE SKIP LOCKED` in `consume()` could overspend.** Two concurrent
   consumers would each skip the other's locked rows, each see a partial balance,
   and both commit — spending the last unit twice. Now plain `FOR UPDATE`.
5. **Entitlements were not wired.** `grantsForSettlement` had no shipped
   consumer, so the feature could not run. `applySettlementEvent` added and
   tested.
6. **`maybeReverseTransfer` could not resolve its purchase.** It runs outside a
   transaction, but the charge-reference lookup only existed on
   `BillingTransaction`. `BillingStore` now exposes
   `findPurchaseByStripeReference`.
7. **Stale log prefix.** `console.error("[billing-metering] …")` in a package now
   called `platform-billing`.
8. **No settlement amount guard.** Added: a purchase whose `amount_captured`
   differs from the catalog is recorded as `failed` and emits no settlement event,
   so nothing is granted. The amount is ours (the session was built from the
   catalog), so a mismatch means tampering or replay.
9. **Platform credential read tenant billing details.** A dispute fallback called
   `charges.retrieve` on the platform key, which would expose a tenant's name,
   last4, and email across all tenants. Removed; the event is skipped instead of
   read at the wrong scope.
10. **`platform-billing` billed tenants for the platform's own rake.**
    `marketplace-gmv-cents` was queried and reported per tenant with no plan
    pricing it. Removed from the tenant meter list.
11. **Unresolved `@px/*` references** in five Kubernetes manifests,
    `docker-compose.yml`, `seed.sh`, and two ADRs, despite
    `IMPLEMENTATION_PLAN.md` claiming that sweep was complete.
12. **`plans.ts` pointed at `../billing-engine/src/bootstrap.ts`**, which never
    existed. The real bootstrap is `infra/compose/lago/seed.sh`.
13. **ADR 0004 asserted a boundary that was never true** — that
    `billing-metering` was imported only by `runtime-core`, with a review rule
    instructing reviewers to reject any other importer. `runtime-core` had
    `dependencies: {}` and emitted nothing.

## Documentation defects also corrected

- `packages/README.md` gained the package inventory, stub register, and known-gaps
  list. It previously contained only release mechanics.
- `px/docs/living-ip-product-plan.md` deep links into package source were
  repointed; they would have broken on the rename.
- `lago-client.ts` and `stripe-connect-client.ts` read secrets from
  `process.env`; both now require injection and throw on empty.

## Known gaps carried forward

| Gap | Where |
|---|---|
| `policy` has no lineage producer, so royalty splits cannot run end to end | `contracts` has no lineage model; `stripeAccountId` is not a `CapabilityContract` field |
| `policy` and `platform-billing` have no tests | Both are 0.0.5 |
| `platform-billing` hardcodes its meter list and the `px-developer-base` subscription id, and its OpenMeter call is unauthenticated | `billing-sync.ts` |
| `sdk` cannot scaffold: `channel init` and `channel deploy` are `console.log("TODO")` | `packages/sdk` |
| `SKIP LOCKED` remains in `claimOutbox`, where it is correct — concurrent workers must not double-claim one outbox event. It was removed only from `consume`, where it caused overspend. | `postgres-store.ts` |
| `realtime-fanout` `Polls.close()` throws — voting works, closing a poll does not | `polls.ts` |
| `registry` `latest()` is insertion order, not semver, so `resolve(id)` returns the wrong version | `capability-registry.ts` |
| Two incompatible `CapabilityRegistry` implementations exist | `contracts/src/capabilities.ts` and `packages/registry` |
| `resolver/dist` holds an orphaned `nap-resolver-adapter` with no `src` counterpart and no export | Its build script lacks the `rm -rf dist` the others use |
| Four packages are stubs: `resolver`, `text-image-delivery`, `narrative-engine-adapter`, `capability-identity` | Every method throws; they typecheck, so an app can compile against one and fail at runtime |

## Outstanding

1. **`massively-social-ebook` has not been migrated onto `monetization`.** It
   imports only `StripePlatformBilling` and `MeteringClient` from
   `platform-billing`. It still hand-rolls its own four tables, a raw-SQL
   migration, a purchase state machine, webhook settlement, and a
   `prompt_requests.status` column that duplicates entitlement balances. Its
   monetization code is **entirely uncommitted** (`server/monetization/` untracked,
   8 tracked files with diffs) and has **no tests**. Its typecheck has 46
   pre-existing errors and 29 failing tests, none in the files that import these
   packages.
2. **The three packages are unpublished.** MSE resolves them through dev
   symlinks in its `node_modules`; a real `npm install` there needs
   `@portalshq/monetization@0.2.0`, `@portalshq/platform-billing@0.0.5`, and
   `@portalshq/policy@0.0.5` on the registry first.
3. **`cloud/frontend` reads `process.env.STRIPE_SECRET_KEY` in 7 route files**,
   each constructing its own client — a shared memoized factory was proposed and
   deliberately left as-is at the user's instruction.
4. **The platform billing endpoint** is unbuilt. Not needed for the credential
   model; still the right answer for untrusted third-party builders.
5. **`MonetizationDispatcher` needs a scheduled `drainOnce`.** The class is
   shipped, tested, and self-wiring, but nothing in the repo runs it yet, because
   no application has been migrated onto the package. Wire it to a worker and add
   an `isStale()` health check.
6. **The rake liability needs a commercial decision** before volume — see
   "accepted cost" above.

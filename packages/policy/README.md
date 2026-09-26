# @portalshq/policy

The rate policy for Portals monetization: platform rake and lineage-weighted
royalty splits. Pure functions, **zero runtime dependencies**, no I/O.

Both `@portalshq/monetization` (which pays out) and `@portalshq/platform-billing`
(which reports the platform's take) depend on this package, so the two can never
disagree about a rate.

## Three responsibilities

1. **`calculateRake()`** — single source of truth for platform rake rates. All
   transaction types run through it. Change rates here, not in ad hoc code.

   | Transaction | Rate | Benchmark |
   |---|---|---|
   | capability-purchase | 20% | Unity/Steam is 30%; start lower to attract providers |
   | creator-subscription | 8% | Patreon is 8–12% |
   | creator-tip | 5% | aggressive — tips are relationship-building |
   | creator-purchase | 10% | one-time purchases and unlocks |

   The Stripe Connect payout fee (0.25% + $0.25/transfer) is deducted from the
   platform's rake, never passed through to the provider — clean provider
   economics are what marketplace trust rests on. The fee is capped at the rake
   so a small purchase cannot produce a negative platform net.

2. **`calculateRoyaltySplits()`** — distributes a net royalty pool across a
   lineage chain of ancestor works ("Stripe Connect for fictional IP"). Original
   work takes 60% of the pool; derivative layers share the rest. The split
   distributes remainders so the pool always sums exactly to the input, and it
   degrades correctly when only one side of the lineage exists.

   The weighting is deliberately simple at launch and expected to evolve with
   creator feedback. The point is that the infrastructure to distribute splits
   exists at all.

3. **`PLATFORM_RAKE_RATES`** — the raw rate table, exported so the invoicing side
   can report a tenant's rake liability against the same numbers.

## Not here

Stripe transport lives elsewhere on purpose. `@portalshq/monetization` owns the
Connect boundary and `StripeConnectClient`; `reportTenantRake` in
`@portalshq/platform-billing` reports the take. This package decides numbers and
performs no I/O, which is what makes the rate table safe to edit.

## Known gap

`LineageEntry` has no producer yet — `@portalshq/contracts` has no lineage model,
only a `resolve(pxAddress)` signature, and the `stripeAccountId` it expects per
provider is not yet a field on `CapabilityContract`. Royalty splits cannot run
end to end until the lineage graph exists.

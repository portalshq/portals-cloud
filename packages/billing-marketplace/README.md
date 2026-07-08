# @portalshq/billing-marketplace

Three responsibilities:
1. `calculateRake()` — single source of truth for platform rake rates.
   All four transaction types (capability purchase, creator subscription,
   tip, purchase) run through this. Change rates here, not in ad hoc code.
2. `calculateRoyaltySplits()` — distributes net royalties across the Portals
   lineage chain. Implements the "Stripe Connect for fictional IP" model.
   Deliberately simple at launch — evolve the weighting model with creator
   feedback.
3. `StripeConnectClient` — executes provider payouts via Stripe Connect
   Transfers. Connected account IDs are stored per-provider in the
   capability registry (TODO: add stripeAccountId field to CapabilityContract).

Stripe Connect fee (0.25% + $0.25/transfer) is absorbed by the platform
rake in `calculateRake()` — providers always receive the clean net amount.

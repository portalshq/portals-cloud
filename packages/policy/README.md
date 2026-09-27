# @portalshq/policy

**Reusable agent module:** [integration guide](../../docs/package-agents/policy.md)

Pure, zero-dependency money-policy helpers. It calculates amounts only; it does not validate inputs, call Stripe, create transfers, or persist records.

```ts
import { calculateRake, calculateRoyaltySplits } from "@portalshq/policy";

const rake = calculateRake(1_000, "creator-tip");
const splits = calculateRoyaltySplits(rake.providerNetCents, lineage);
```

## API

- `calculateRake(grossAmountCents, type, currency?)`: returns gross amount, platform rake, provider net, estimated Connect fee, and platform net.
- `PLATFORM_RAKE_RATES`: the rate table used by `calculateRake`.
- `calculateRoyaltySplits(netRoyaltyPoolCents, lineage)`: allocates 60% to depth-0 originals and 40% across derivatives; if either group is empty, the other receives the full pool. Remainders are distributed so totals match the input exactly.

## Guardrails

- Amounts are integer cents. Validate non-negative amounts and supported currencies at your payment boundary; this package currently does not.
- The `currency` argument is accepted but does not alter the USD Connect-fee formula.
- Royalty splits are calculation-only. Portals has no implemented lineage producer or end-to-end payout path yet.

# @portals/billing-engine

Lago wrapper. Owns the bridge between raw OpenMeter usage aggregates and
Lago's pricing/invoicing engine. Two components:

- `LagoClient` — thin HTTP wrapper used both for customer/subscription
  management (onboarding path) and for triggering one-off invoices
  (post live-event billing).
- `BillingSync` — runs as a K8s CronJob, not in the hot path. Pulls
  OpenMeter usage per tenant per period and reports it to Lago for
  end-of-billing-cycle invoice generation.

`plans.ts` is the canonical billing plan definition. If pricing changes,
change it here and re-run the bootstrap script — don't edit plans directly
in the Lago UI without updating this file, or the two diverge.

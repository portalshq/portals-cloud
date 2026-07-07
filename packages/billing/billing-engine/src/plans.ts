/**
 * Lago billing plan definitions.
 *
 * Each plan maps to one or more Lago "charges" (usage-based components
 * in Lago's terminology) plus an optional flat subscription fee. These
 * mirror the monetization models from the ranking document.
 *
 * Lago plans are created via the Lago API or UI; this file is the
 * source-of-truth configuration that should be applied on first deployment
 * via the bootstrap script (see ../billing-engine/src/bootstrap.ts).
 *
 * All amounts in the currency's minor unit (cents for USD).
 */

export const BillingPlans = {
  /**
   * Developer / channel creator plan.
   * Hybrid: base platform fee + usage-based capability invocations
   * + per-session-minute compute tax + storage.
   * Maps to monetization models #6 (managed platform) + #8 (compute).
   */
  DEVELOPER_BASE: {
    lagoCode: "nap-developer-base",
    name: "Portals Developer Base",
    interval: "monthly",
    amountCents: 0,       // freemium entry — paid plans upgrade here
    amountCurrency: "USD",
    charges: [
      {
        billableMetricCode: "capability-invocations",
        chargeModel: "graduated",    // Lago "graduated" = tiered pricing
        tiers: [
          { fromValue: 0, toValue: 100_000, unitAmountCents: 0 },     // free tier
          { fromValue: 100_001, toValue: 1_000_000, unitAmountCents: 1 }, // $0.0001/call
          { fromValue: 1_000_001, toValue: null, unitAmountCents: 0.5 },  // volume discount
        ],
      },
      {
        billableMetricCode: "session-minutes",
        chargeModel: "standard",
        unitAmountCents: 2,   // $0.02 per session-minute
      },
      {
        billableMetricCode: "storage-written-bytes",
        chargeModel: "graduated",
        tiers: [
          { fromValue: 0, toValue: 1_073_741_824, unitAmountCents: 0 },         // 1GB free
          { fromValue: 1_073_741_825, toValue: null, unitAmountCents: 0.000001 }, // $0.10/GB
        ],
      },
    ],
  },

  /**
   * Live event pricing plan.
   * Per-concurrent-viewer-peak pricing for broadcast events.
   * Maps to monetization model #3 (live interactive events).
   * Applied as an add-on charge to sessions with >100 concurrent viewers.
   */
  LIVE_EVENT_ADD_ON: {
    lagoCode: "nap-live-event",
    name: "Portals Live Event",
    interval: "once",     // Lago one-time charge, applied per event
    amountCents: 0,
    amountCurrency: "USD",
    charges: [
      {
        billableMetricCode: "peak-concurrent-viewers",
        chargeModel: "package",     // Lago "package" = per N units
        packageSize: 1,
        amountCents: 1,   // $0.01 per peak concurrent viewer, e.g. 50k viewers = $500
      },
    ],
  },

  /**
   * Managed enterprise plan.
   * Flat fee + SLA + custom usage limits.
   * Maps to monetization model #6 (full-stack managed platform).
   * Negotiated per studio — amountCents set per contract.
   */
  ENTERPRISE: {
    lagoCode: "nap-enterprise",
    name: "Portals Enterprise",
    interval: "monthly",
    amountCents: 500_000, // $5,000/month base — overridden per customer in Lago
    amountCurrency: "USD",
    charges: [],  // usage overages billed per negotiated contract
  },
} as const;

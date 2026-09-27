<!-- doc-module: platform-billing-agent-guide -->
# Platform billing: agent guide
## Load when
Metering tenant infrastructure use in OpenMeter, synchronizing it to Lago, or using platform B2B Stripe helpers.
## Use
Create matching meters/subscriptions first; run sync out of band; monitor best-effort metering and skipped OpenMeter queries.
## Do not assume
It handles creator payouts, authenticates OpenMeter reads, batches HTTP emission, or has production-ready test coverage.

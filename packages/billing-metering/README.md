# @portals/billing-metering

OpenMeter client. The only package in the repo that knows how to emit
billable events. runtime-core imports this; capability packages do not.
Capability packages report structured outputs through their contracts;
billing metering is runtime-core's cross-cutting concern, not per-capability
code.

## Meters you need to define in OpenMeter (one-time setup)

Once OpenMeter is deployed, create these meters in its UI or via API:

| Meter ID                  | Event type               | Aggregation | Description                          |
|---------------------------|--------------------------|-------------|--------------------------------------|
| capability-invocations    | capability.invoked       | COUNT       | Per-capability call volume           |
| session-minutes           | session.ended            | SUM(durationSeconds/60) | Compute tax |
| peak-concurrent-viewers   | session.ended            | MAX(peakConcurrentViewers) | Event pricing |
| storage-written-bytes     | storage.written          | SUM(bytes)  | Persistence billing                  |
| marketplace-gmv-cents     | marketplace.transaction  | SUM(grossAmountCents) | Rake basis    |

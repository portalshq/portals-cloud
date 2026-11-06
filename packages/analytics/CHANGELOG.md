# @portalshq/analytics

## 0.2.0

### Minor Changes

- ea59c0e: Add durable automatic analytics delivery: a versioned package-owned ledger (`portals_analytics_delivery`), bounded discovery behind a required `ANALYTICS_START_AT` launch cutoff, lease-safe `FOR UPDATE SKIP LOCKED` claims for concurrent workers, classified delivery outcomes with capped retries and operator retry, namespaced stable event IDs, a supervised `portals-analytics` command with billing-only fallback, and schema validation against the real monetization and interaction outbox contracts. Browser collection now drops queued events immediately when collection becomes disallowed.

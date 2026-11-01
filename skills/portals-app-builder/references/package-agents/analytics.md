<!-- doc-module: analytics-agent-guide -->
# Analytics: agent guide
## Load when
Working on event contracts, the browser recorder, the Segment adapter, the `portals-analytics` connector, delivery ledger behavior, inventory, or reconciliation.
## Use
Run the connector (`AnalyticsConnector` or `npm exec portals-analytics`) as a supervised process with `ANALYTICS_DATABASE_URL`, `SEGMENT_SERVER_WRITE_KEY`, `ANALYTICS_APP_ID`, `ANALYTICS_TENANT_ID`, and a UTC `ANALYTICS_START_AT` cutoff. It owns `portals_analytics_delivery`/`portals_analytics_discovery`/`portals_analytics_migrations`, reads `monetization_outbox` and `interaction_outbox` read-only, claims with `FOR UPDATE SKIP LOCKED` leases, and classifies outcomes (`delivered`, `excluded`, retryable, `blocked`, `dead`). Interaction delivery additionally needs `ANALYTICS_CONTEXT_MODULE` exporting `resolveWorld` and `resolveInteractionIdentity`; records without verified identity stay `blocked`. Reconcile in BigQuery by `portals_source_kind` + `portals_source_id`; delivery is at least once.
## Do not assume
Analytics may live inside monetization or interaction-orchestrator — business packages never import this package or call vendors from transaction paths. `ANALYTICS_START_AT` can be skipped; Segment acceptance equals BigQuery arrival; delivery is exactly-once; browser-asserted identity is acceptable; or a transmitted event can be withdrawn.

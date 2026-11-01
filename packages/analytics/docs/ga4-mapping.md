# Segment to GA4 mapping

Configure these destination actions explicitly; the package does not configure vendor accounts. Map `portals_event_id`, `portals_source_id`, `portals_source_kind`, `portals_schema_version`, and `portals_provenance` as event parameters where supported; connector-delivered events carry the namespaced `portals_event_id` (`portals-analytics:<app>:<tenant>:<kind>:<sourceId>`) plus the original source identity for warehouse reconciliation. Map `amount`, `refunded_amount`, and `currency` with clear minor-unit semantics; do not map minor units directly to GA4 revenue. A GA4 `purchase` event requires its own verified currency, transaction identifier, and major-unit mapping; it is not automatically generated here. Validate destination identifier and session requirements before enabling server-originated GA4 events.

| Segment event | GA4 custom event |
| --- | --- |
| custom.channel_follow_toggled | portals_channel_follow_toggled |
| custom.channel_share_attempted | portals_channel_share_attempted |
| custom.channel_share_result | portals_channel_share_result |
| billing.purchase_settled | portals_purchase_settled |
| billing.purchase_refunded | portals_purchase_refunded |
| billing.purchase_disputed | portals_purchase_disputed |
| interaction.window_created | portals_window_created |
| interaction.window_state_changed | portals_window_state_changed |
| interaction.submission_created | portals_submission_created |
| interaction.submission_status_changed | portals_submission_status_changed |
| interaction.submission_rejected | portals_submission_rejected |
| interaction.resolution_selected | portals_resolution_selected |
| interaction.resolution_executing | portals_resolution_executing |
| interaction.resolution_committed | portals_resolution_committed |
| interaction.resolution_failed | portals_resolution_failed |
| interaction.billing_authorized | portals_billing_authorized |
| interaction.billing_captured | portals_billing_captured |
| interaction.billing_released | portals_billing_released |

Custom events must have an explicit destination mapping selected by the application; never blindly map arbitrary names or properties. GA4 event naming, quotas, destination support, and report interpretation must be checked in the configured account.

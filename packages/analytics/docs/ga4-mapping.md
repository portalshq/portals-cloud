# Segment to GA4 mapping

Configure these destination actions explicitly; the package does not configure vendor accounts. Map `portals_event_id`, `portals_source_id`, `portals_source_kind`, `portals_schema_version`, and `portals_provenance` as event parameters where supported; connector-delivered events carry the namespaced `portals_event_id` (`portals-analytics:<app>:<tenant>:<kind>:<sourceId>`) plus the original source identity for warehouse reconciliation. Map `amount`, `refunded_amount`, and `currency` with clear minor-unit semantics; do not map minor units directly to GA4 revenue. A GA4 `purchase` event requires its own verified currency, transaction identifier, and major-unit mapping; it is not automatically generated here. Validate destination identifier and session requirements before enabling server-originated GA4 events.

| Segment event | GA4 custom event |
| --- | --- |
| custom.channel_follow_toggled | portals_channel_follow_toggled |
| custom.channel_share_attempted | portals_channel_share_attempted |
| custom.channel_share_result | portals_channel_share_result |
| custom.page_viewed | portals_page_viewed |
| custom.channel_card_impression | portals_channel_card_impression |
| custom.channel_opened | portals_channel_opened |
| custom.channel_search_used | portals_channel_search_used |
| custom.channel_filter_changed | portals_channel_filter_changed |
| custom.cta_activated | portals_cta_activated |
| custom.media_impression | portals_media_impression |
| custom.media_started | portals_media_started |
| custom.media_engaged | portals_media_engaged |
| custom.media_progress | portals_media_progress |
| custom.media_watch_time | portals_media_watch_time |
| custom.media_buffered | portals_media_buffered |
| custom.media_recovered | portals_media_recovered |
| custom.media_failed | portals_media_failed |
| custom.media_ended | portals_media_ended |
| custom.media_control_used | portals_media_control_used |
| custom.follow_result | portals_follow_result |
| custom.share_result | portals_share_result |
| custom.reminder_prompt_opened | portals_reminder_prompt_opened |
| custom.reminder_save_result | portals_reminder_save_result |
| custom.auth_started | portals_auth_started |
| custom.auth_result | portals_auth_result |
| custom.auth_signed_out | portals_auth_signed_out |
| custom.checkout_started | portals_checkout_started |
| custom.checkout_result | portals_checkout_result |
| custom.pwa_install_result | portals_pwa_install_result |
| custom.community_panel_toggled | portals_community_panel_toggled |
| custom.chat_send_result | portals_chat_send_result |
| custom.note_submit_result | portals_note_submit_result |
| custom.note_like_result | portals_note_like_result |
| custom.reaction_send_result | portals_reaction_send_result |
| custom.interaction_presented | portals_interaction_presented |
| custom.interaction_submission_result | portals_interaction_submission_result |
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
| interaction.choice_opened | portals_choice_opened |
| interaction.choice_resolved | portals_choice_resolved |
| interaction.guide_opened | portals_guide_opened |
| interaction.feedback_opened | portals_feedback_opened |
| interaction.feedback_rewarded | portals_feedback_rewarded |
| interaction.reaction_recorded | portals_reaction_recorded |

Custom events must have an explicit destination mapping selected by the application; never blindly map arbitrary names or properties. GA4 event naming, quotas, destination support, and report interpretation must be checked in the configured account.

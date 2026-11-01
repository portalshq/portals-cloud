# HubSpot CRM Manual Setup Guide

This document describes all custom fields, property groups, and pipelines needed to configure HubSpot for Portals lead qualification and pilot management. Use this guide to manually set up HubSpot when the API provisioning script cannot be used (e.g., due to custom object limitations on free tier).

## Property Groups

Create these property groups in each object type to organize fields in the HubSpot UI:

### All Object Types (Contacts, Companies, Deals, Tickets)
1. **portals_lead_qualification** - Qualification scores and tier information
2. **portals_pilot_management** - Pilot-specific fields and deal information
3. **portals_assessment** - Assessment diagnostic fields and workflow data

---

## Contact Custom Fields

### Identity & Role Fields
| Field Name | Label | Type | Options | Description |
|------------|-------|------|---------|-------------|
| preferred_asset_format | Preferred asset format | Select | image, video, 3d_model, animation, audio, mixed_media, other | Primary asset format preference |
| team_role | Team role | Select | owns_delivery_or_margin, production_management, ai_or_technical_workflow_owner, creative_approver, pipeline_or_engineering, contributor, executive_sponsor, other | Team member's role |
| asset_contribution_count | Asset contribution count | Number | - | Number of assets contributed by contact |
| approval_authority | Approval authority | Select | can_approve, can_recommend, need_another_sponsor, not_involved_in_purchase | Level of approval authority |

### Qualification & Scoring Fields
| Field Name | Label | Type | Options | Description |
|------------|-------|------|---------|-------------|
| lead_intent | Lead intent | Select | guide_download, security_download, pilot_brief_download, assessment, commercial_readiness, workflow_review, pilot_request, contact, commercial_event, workflow_assessment, pilot_scope, pilot_revision, assessment_override, general, workflow-review, security-review, integration, commercial, other | Primary intent of the lead |
| qualification_score | Qualification score | Number | - | Overall qualification score |
| qualification_tier | Qualification tier | Select | high, medium, low, incomplete | Qualification tier classification |
| qualification_state | Qualification state | Select | not_qualified, qualified | Qualified or not qualified |
| fit_score | Fit score | Number | - | Fit dimension score |
| fit_coverage | Fit coverage | Number | - | Fit dimension coverage percentage |
| pain_score | Pain score | Number | - | Pain dimension score |
| pain_coverage | Pain coverage | Number | - | Pain dimension coverage percentage |
| intent_score | Intent score | Number | - | Intent dimension score |
| intent_coverage | Intent coverage | Number | - | Intent dimension coverage percentage |
| workflow_risk_score | Workflow risk score | Number | - | Overall workflow risk score |

### Assessment Diagnostic Fields
| Field Name | Label | Type | Options | Description |
|------------|-------|------|---------|-------------|
| production_role | Production role | Single line text | - | Role in production workflow |
| company_type | Company type | Select | agency, creative-studio, production-company, in-house-creative, brand-marketing, film-animation, game-entertainment, independent-creator, other | Type of company |
| team_size | Team size | Select | 1, 2-4, 5-9, 10-24, 25-plus | Team size range |
| workflow_collaborators | Workflow collaborators | Single line text | - | Number of workflow collaborators |
| tools_used | Tools used | Single line text | - | Comma-separated list of AI tools |
| approved_version_method | Approved-version method | Select | canonical-system, documented-review, folder-naming, chat-spreadsheet, creator-memory, inconsistent | How approved versions are tracked |
| production_context_method | Production-context method | Select | attached-record, project-document, multiple-tools, chat-personal-notes, memory-inconsistent | How production context is stored |
| recreation_frequency | Recreation frequency | Select | never, quarterly, monthly, weekly, daily | How often assets are recreated |
| incident_type | Incident type | Single line text | - | Type of production incident |
| incident_description | Incident description | Multiple line text | - | Description of incident |
| people_affected | People affected | Single line text | - | Number of people affected |
| hours_lost | Hours lost | Single line text | - | Hours lost per incident |
| delivery_impact | Delivery impact | Single line text | - | Impact on delivery |
| recurring_workflow | Recurring workflow | Single line text | - | Name of recurring workflow |
| asset_volume | Asset volume | Single line text | - | Volume of assets produced |
| annual_affected_value | Annual affected value | Single line text | - | Annual value affected by issues |
| active_workflows | Active workflows | Multi-select | approved-version-retrieval, asset-reproduction, five-more-like-this, character-continuity, production-handoff, campaign-variant-control, make_twelve_more_like_this, approved_version_retrieval, character_or_identity_continuity, campaign_variant_production, production_handoff, asset_reproduction, rd_to_production_transfer, multi_tool_ai_production, agent_assisted_production, localization_or_market_adaptation, other | Active workflows being used |
| active_workflow | Active workflow | Single line text | - | Most urgent active workflow |
| timeline | Timeline | Select | within-30-days, within-60-days, this-quarter, later, 1-3-months, 3-plus-months, not-planned | Timeline for implementation |
| current_systems | Current systems | Multiple line text | - | Current systems in use |
| unresolved_question | Unresolved question | Multiple line text | - | Unresolved questions about Portals |
| stakeholder_involved | Stakeholder involved | Boolean checkbox | - | Whether stakeholder is involved |
| production_owner | Production owner | Single line text | - | Name of production owner |
| production_owner_email | Production owner email | Single line text | - | Email of production owner |
| pilot_tier | Pilot tier | Select | studio, enterprise | Pilot tier selected |
| approval_path | Approval path | Single line text | - | Approval path for purchases |
| primary_objection | Primary objection | Single line text | - | Primary objection to pilot |
| objection_detail | Objection detail | Multiple line text | - | Details about objection |
| pilot_workflow | Pilot workflow | Multiple line text | - | Description of pilot workflow |
| economic_buyer | Economic buyer | Single line text | - | Name of economic buyer |
| technical_evaluator | Technical evaluator | Single line text | - | Name of technical evaluator |
| required_integrations | Required integrations | Multiple line text | - | Required system integrations |
| success_criteria | Success criteria | Multiple line text | - | Success criteria for pilot |
| security_requirements | Security requirements | Multiple line text | - | Security requirements |
| budget_readiness | Budget readiness | Single line text | - | Budget readiness status |
| budget_owner | Budget owner | Single line text | - | Name of budget owner |
| historical_project | Historical project | Single line text | - | Historical project status |
| historical_project_name | Historical project name | Single line text | - | Name of historical project |
| integration_method | Integration method | Single line text | - | Integration method chosen |
| integration_systems_json | Integration systems JSON | Multiple line text | - | JSON of integration systems |
| data_classification | Data classification | Single line text | - | Data classification level |
| participants_range | Participants range | Single line text | - | Range of participants |
| approver_name | Approver name | Single line text | - | Name of approver |
| approver_role | Approver role | Single line text | - | Role of approver |
| approver_email | Approver email | Single line text | - | Email of approver |
| economic_buyer_email | Economic buyer email | Single line text | - | Email of economic buyer |
| technical_evaluator_email | Technical evaluator email | Single line text | - | Email of technical evaluator |
| procurement_po_required | Procurement PO required | Boolean checkbox | - | Whether PO is required |
| procurement_review_time | Procurement review time | Single line text | - | Time for procurement review |
| annual_deployment_option | Annual deployment option | Single line text | - | Annual deployment option |
| annual_price_acknowledged | Annual price acknowledged | Boolean checkbox | - | Acknowledged annual pricing |
| signer_name | Signer name | Single line text | - | Name of signer |
| signer_email | Signer email | Single line text | - | Email of signer |
| exact_reproduction_required | Exact reproduction required | Boolean checkbox | - | Whether exact reproduction is required |
| pilot_blocker | Pilot blocker | Multiple line text | - | Blockers to pilot |
| message | Message | Multiple line text | - | Custom message from contact |

### Production State Diagnostic Fields
| Field Name | Label | Type | Options | Description |
|------------|-------|------|---------|-------------|
| production_status | Production status | Select | live_now, within_30_days, within_1_to_3_months, experimenting_or_researching | Current production status |
| contributors_count | Contributors count | Select | 1, 2_5, 6_10, 11_25, 25_plus | Number of contributors |
| imminent_contributor_scaling | Imminent contributor scaling | Select | yes, no, unsure | Whether contributor scaling is imminent |
| pilot_readiness_30d | Pilot readiness 30d | Select | yes_live_production, possibly, no_researching | Pilot readiness in 30 days |
| transferability_without_originator | Transferability without originator | Select | yes_reliably, usually_minor_help, substantial_handoff, usually_not, not_tested | Ability to transfer without originator |
| time_to_transfer | Time to transfer | Select | under_30_minutes, 30m_to_2h, half_day, one_day, two_to_five_days, may_not_reproduce_reliably, unknown | Time to transfer context |
| context_storage_locations | Context storage locations | Multi-select | generation_workflow_or_graph, project_or_asset_management_system, google_drive, shared_hard_disk, cloud_storage, docs_and_spreadsheets, slack_channel, contributor_local_files, creator_memory_or_undocumented, internal_system, other | Where context is stored |
| captured_production_state | Captured production state | Multi-select | prompt_or_template, model_and_model_version, lora_adapter_finetune_version, seed_and_generation_parameters, source_or_input_assets, exact_source_asset_versions, reference_selection, control_or_preprocessing_inputs, workflow_graph, scripts_or_automation, approval_state, client_feedback_or_decisions, canonical_approved_output, dependencies_between_inputs_and_outputs, negative_prompts_or_exclusions, provenance_or_rights, human_instructions_required_to_use_workflow, other, none | What production state is captured |
| execution_state_complete | Execution state complete | Select | yes, no_external_state_required, unsure | Whether execution state is complete |
| manual_handoff_requirements | Manual handoff requirements | Multi-select | references_to_use, current_asset_versions, prompt_or_workflow_instructions, model_or_lora_selection, generation_settings, client_feedback_or_approval_history, creative_intent_or_art_direction, scripts_or_technical_setup, known_failed_approaches, nothing_significant, other | Manual handoff requirements |
| context_interrupt_owner | Context interrupt owner | Multi-select | original_creator, ai_lead, producer, creative_director, pipeline_or_technical_artist, client_or_account_team, nobody, other | Who owns context interrupts |
| production_failures | Production failures | Multi-select | wrong_reference, outdated_source_asset, wrong_approved_version, character_product_style_drift, unable_to_reproduce_approved_output, unnecessary_generations_or_retries, duplicate_work, long_handoff_or_onboarding, rd_workflow_rebuilt_for_production, client_review_failure, lost_or_unclear_provenance, none, other | Production failure types |
| most_recent_incident | Most recent incident | Single line text | - | Description of most recent incident |
| time_lost_per_incident | Time lost per incident | Select | under_1_hour, 1_to_4_hours, half_day, one_day, 2_to_5_days, more_than_week, unknown | Time lost per incident |
| cost_bearer | Cost bearer | Select | production_or_studio_margin, client, freelancers_or_vendors, internal_creative_team, schedule_or_delivery, other | Who bears the cost |
| affected_work_value | Affected work value | Select | under_100k, 100k_500k, 500k_1m, 1m_5m, 5m_plus, prefer_not_to_say | Value of affected work |
| most_urgent_active_workflow | Most urgent active workflow | Single line text | - | Most urgent workflow |
| agent_context_resolution | Agent context resolution | Select | deterministic_approved_context, manually_supplied, searches_unverified_sources, operator_memory, unknown | How agent resolves context |
| agent_context_detail | Agent context detail | Single line text | - | Details about agent context |
| production_type | Production type | Select | commercial_branded, film_episodic, vfx_animation_virtual_production, interactive_games, social_short_form, internal_creative, other | Type of production |
| workflow_role | Workflow role | Select | owns_delivery_or_margin, production_management, ai_or_technical_workflow_owner, creative_approver, pipeline_or_engineering, contributor, executive_sponsor, other | Role in workflow |
| ai_tools | AI tools | Multi-select | ComfyUI, Runway, Midjourney, Adobe Firefly, Stable Diffusion, ChatGPT / OpenAI, Google Gemini / Veo, Kling, Luma, Higgsfield, fal, Replicate, Nuke, Houdini, Blender, Unreal Engine, other | AI tools used |
| ip_controlled_content | IP controlled content | Select | yes, no, unsure | Whether content is IP-controlled |
| incorrect_source_exposure | Incorrect source exposure | Select | yes, no, unsure | Risk of incorrect source exposure |
| source_traceability_required | Source traceability required | Select | yes, no, unsure | Whether source traceability is required |
| adoption_authority | Adoption authority | Select | can_approve, can_recommend, need_another_sponsor, not_involved_in_purchase | Authority to adopt |
| approval_path_detail | Approval path detail | Multiple line text | - | Details about approval path |

### System & Metadata Fields
| Field Name | Label | Type | Options | Description |
|------------|-------|------|---------|-------------|
| assessment_version | Assessment version | Single line text | - | Version of assessment completed |
| operational_fit_score | Operational fit score | Number | - | Operational fit score (diagnostic) |
| commercial_readiness_score | Commercial readiness score | Number | - | Commercial readiness score (diagnostic) |
| production_state_bottleneck | Production state bottleneck | Multiple line text | - | Production state bottleneck description |
| production_baseline | Production baseline | Multiple line text | - | Production baseline description |
| a_state_person_dependent | A_STATE_PERSON_DEPENDENT | Boolean checkbox | - | Signal A: person dependency |
| a_state_person_dependent_evidence | A_STATE_PERSON_DEPENDENT evidence | Multiple line text | - | Evidence for signal A |
| b_missing_generative_state | B_MISSING_GENERATIVE_STATE | Boolean checkbox | - | Signal B: missing generative state |
| b_missing_generative_state_evidence | B_MISSING_GENERATIVE_STATE evidence | Multiple line text | - | Evidence for signal B |
| c_throughput_correctness | C_THROUGHPUT_CORRECTNESS | Boolean checkbox | - | Signal C: throughput correctness |
| c_throughput_correctness_evidence | C_THROUGHPUT_CORRECTNESS evidence | Multiple line text | - | Evidence for signal C |
| qualifying_submission_id | Qualifying submission ID | Single line text | - | ID of qualifying submission |
| last_submission_id | Last submission ID | Single line text | - | ID of last submission |
| last_submission_type | Last submission type | Select | guide_download, security_download, pilot_brief_download, assessment, commercial_readiness, workflow_review, pilot_request, contact, commercial_event | Type of last submission |

### Attribution & Marketing Fields
| Field Name | Label | Type | Options | Description |
|------------|-------|------|---------|-------------|
| cta_label | CTA label | Single line text | - | Label of CTA clicked |
| source_page | Source page | Single line text | - | Page where submission originated |
| use_case_interest | Use case interest | Multi-select | approved-version-retrieval, asset-reproduction, five-more-like-this, character-continuity, production-handoff, campaign-variant-control, other, data-protection, access-controls, resilience, data-lifecycle, vendors, assurance | Use case interest |
| referrer | Referrer | Single line text | - | HTTP referrer |
| utm_source | UTM source | Single line text | - | UTM source parameter |
| utm_medium | UTM medium | Single line text | - | UTM medium parameter |
| utm_campaign | UTM campaign | Single line text | - | UTM campaign parameter |
| utm_content | UTM content | Single line text | - | UTM content parameter |
| utm_term | UTM term | Single line text | - | UTM term parameter |
| operating_system | Operating system | Single line text | - | User's operating system |
| first_touch_page | First touch page | Single line text | - | First page visited |
| last_touch_page | Last touch page | Single line text | - | Last page visited |
| last_cta_clicked | Last CTA clicked | Single line text | - | Last CTA clicked |
| recommended_next_action | Recommended next action | Select | download, pilot_scope, pilot_room, assessment_review, commercial_clarification, use_case, calendar, follow_up | Recommended next action |
| what_brought_you_here | What brought you here | Select | workflow-problem, assess-scaling, evaluating-tools, other | Primary motivation |
| what_brought_you_here_other | What brought you here (other) | Multiple line text | - | Other motivation details |
| how_did_you_hear_about_portals | How did you hear about portals | Select | google-search, linkedin, email, someone-company, friend-colleague, article-newsletter-podcast, partner-company, social-media | Discovery channel |

### Consent Fields
| Field Name | Label | Type | Options | Description |
|------------|-------|------|---------|-------------|
| marketing_consent | Marketing consent | Boolean checkbox | - | Consent for marketing communications |
| analytics_consent | Analytics consent | Boolean checkbox | - | Consent for analytics tracking |

---

## Company Custom Fields

### Qualification & Scoring Fields
| Field Name | Label | Type | Options | Description |
|------------|-------|------|---------|-------------|
| qualification_tier | Qualification tier | Select | high, medium, low, incomplete | Company qualification tier |
| qualification_state | Qualification state | Select | not_qualified, qualified | Company qualification state |
| fit_score | Fit score | Number | - | Company fit score |
| fit_coverage | Fit coverage | Number | - | Company fit coverage |
| pain_score | Pain score | Number | - | Company pain score |
| pain_coverage | Pain coverage | Number | - | Company pain coverage |
| intent_score | Intent score | Number | - | Company intent score |
| intent_coverage | Intent coverage | Number | - | Company intent coverage |
| qualifying_submission_id | Qualifying submission ID | Single line text | - | Qualifying submission ID |
| pilot_tier | Pilot tier | Select | studio, enterprise | Pilot tier for company |

### HubSpot-Specific Company Fields
| Field Name | Label | Type | Options | Description |
|------------|-------|------|---------|-------------|
| asset_usage_policy | Asset usage policy | Multi-select | internal_only, client_delivery, portfolio_use, public_use, commercial_reuse, other | How assets can be used |
| preferred_creative_tool | Preferred creative tool | Multi-select | ComfyUI, Runway, Midjourney, Adobe Firefly, Stable Diffusion, ChatGPT / OpenAI, Google Gemini / Veo, Kling, Luma, Higgsfield, fal, Replicate, Nuke, Houdini, Blender, Unreal Engine, other | Primary creative tools |
| number_of_locations | Number of locations | Number | - | Number of office/production locations |

### Attribution Fields
| Field Name | Label | Type | Options | Description |
|------------|-------|------|---------|-------------|
| first_touch_page | First touch page | Single line text | - | First page visited by company |
| last_touch_page | Last touch page | Single line text | - | Last page visited by company |
| recommended_next_action | Recommended next action | Select | download, pilot_scope, pilot_room, assessment_review, commercial_clarification, use_case, calendar, follow_up | Recommended next action for company |

---

## Deal Custom Fields

### Deal Contact Roles
| Field Name | Label | Type | Options | Description |
|------------|-------|------|---------|-------------|
| deal_contact_roles | Deal contact roles | Multiple line text | - | JSON array of contact roles: [{"role": "Initial Contact", "name": "...", "email": "..."}, ...] |

### Deal Tracking
| Field Name | Label | Type | Options | Description |
|------------|-------|------|---------|-------------|
| portals_submission_id | Pilot submission ID | Single line text | - | Unique ID from Portals application |

### HubSpot-Specific Deal Fields
| Field Name | Label | Type | Options | Description |
|------------|-------|------|---------|-------------|
| asset_reuse_percentage_target | Asset reuse percentage target | Number | - | Target percentage for asset reuse |
| asset_type_requested | Asset type requested | Select | image, video, 3d_model, animation, audio, mixed_media, other | Type of assets requested |
| deadline_for_delivery | Deadline for delivery | Date | - | Delivery deadline |
| number_of_assets_required | Number of assets required | Number | - | Total number of assets needed |

---

## Ticket Custom Fields

### Ticket Information
| Field Name | Label | Type | Options | Description |
|------------|-------|------|---------|-------------|
| asset_version_issue | Asset version issue | Single line text | - | Description of version issue |
| urgency_level | Urgency level | Select | critical, high, medium, low | Urgency of the issue |
| asset_affected | Asset affected | Single line text | - | Which asset is affected |
| resolution_type | Resolution type | Select | manual_fix, workflow_update, training, documentation, other | Type of resolution |

---

## Pipelines

### Contact Lifecycle Pipeline
**Pipeline Name:** lifecycle

| Stage | Display Order | Probability |
|-------|--------------|-------------|
| Cold | 0 | 0.00 |
| Interested | 1 | 0.25 |
| Replied | 2 | 0.50 |
| Pilot Requested | 3 | 0.75 |

**Default Stage:** Cold

### Company Lifecycle Pipeline
**Pipeline Name:** lifecycle

| Stage | Display Order | Probability |
|-------|--------------|-------------|
| Pilot Requested | 0 | 0.00 |
| Pilot Scoped | 1 | 0.25 |
| Paid Pilot | 2 | 0.50 |
| Annual Proposal | 3 | 0.75 |
| Customer | 4 | 1.00 |
| Nurture | 5 | 0.50 |
| Disqualified | 6 | 0.00 |

**Default Stage:** Pilot Requested

### Deal Sales Pipeline
**Pipeline Name:** sales_pipeline

| Stage | Display Order | Probability |
|-------|--------------|-------------|
| Pilot Requested | 0 | 0.00 |
| Pilot Scoped | 1 | 0.25 |
| Paid Pilot | 2 | 0.50 |
| Customer | 3 | 1.00 |

**Default Stage:** Pilot Requested

### Ticket Support Pipeline
**Pipeline Name:** support_pipeline

| Stage | Display Order | Probability |
|-------|--------------|-------------|
| New | 0 | 0.00 |
| Triaged | 1 | 0.10 |
| In Progress | 2 | 0.25 |
| Waiting on Customer | 3 | 0.25 |
| Resolved | 4 | 0.75 |
| Closed | 5 | 1.00 |

**Default Stage:** New

---

## Manual Setup Steps

### Step 1: Create Property Groups
For each object type (Contacts, Companies, Deals, Tickets):
1. Go to Settings → Properties → Manage properties
2. Click "Create property group"
3. Create these groups:
   - `portals_lead_qualification`
   - `portals_pilot_management`
   - `portals_assessment`
4. Set display order to 5 for each group

### Step 2: Create Contact Custom Fields
1. Go to Settings → Properties → Contact properties
2. For each field in the Contact Custom Fields section:
   - Click "Create property"
   - Set Group to appropriate group (portals_lead_qualification, portals_pilot_management, or portals_assessment)
   - Enter Field Name (internal name)
   - Enter Label (display name)
   - Select Field Type
   - If Select or Multi-select, add options
   - Add Description if provided
   - Click "Save"

### Step 3: Create Company Custom Fields
1. Go to Settings → Properties → Company properties
2. Repeat the same process for Company Custom Fields
3. Assign to appropriate property groups

### Step 4: Create Deal Custom Fields
1. Go to Settings → Properties → Deal properties
2. Repeat the same process for Deal Custom Fields
3. Assign to appropriate property groups

### Step 5: Create Ticket Custom Fields
1. Go to Settings → Properties → Ticket properties
2. Repeat the same process for Ticket Custom Fields
3. Assign to appropriate property groups

### Step 6: Create Pipelines
1. Go to Settings → Objects → Deals (or Contacts/Companies/Tickets)
2. Click "Pipelines"
3. Click "Create pipeline"
4. Enter pipeline name
5. Add stages with display order and probability
6. Set default stage
7. Click "Save"

Repeat for all 4 pipelines:
- Contact lifecycle pipeline
- Company lifecycle pipeline
- Deal sales_pipeline
- Ticket support_pipeline

### Step 7: Verify Setup
1. Check that all property groups exist
2. Verify all custom fields are created and in correct groups
3. Confirm all pipelines have correct stages
4. Test field visibility in contact/company/deal/ticket records

---

## Field Type Reference

| HubSpot Field Type | Description |
|-------------------|-------------|
| Single line text | Short text field (up to 255 characters) |
| Multiple line text | Long text field (no character limit) |
| Number | Numeric field (decimal or integer) |
| Boolean checkbox | True/false checkbox |
| Date | Date picker |
| Select | Dropdown with single selection |
| Multi-select | Dropdown with multiple selections |

---

## Important Notes

1. **Field Names Matter**: The internal field names (e.g., `preferred_asset_format`) must match exactly for the API sync to work. Labels can be customized.

2. **Select Options**: For Select and Multi-select fields, the option values must match exactly what's listed. The display labels can be different if needed.

3. **Property Groups**: Organizing fields into groups makes the UI cleaner and helps with permissions later.

4. **Pipelines**: The stage order and probability affect HubSpot's forecasting and reporting. Keep these as specified.

5. **Contact Roles**: The `deal_contact_roles` field stores a JSON array. This is a workaround until HubSpot supports native contact role associations on deals.

6. **API Sync**: Once manually configured, the HubSpot sync code in `frontend/src/lib/leads/hubspot.ts` will work correctly using these field names.

---

## Validation Checklist

After manual setup, verify:

- [ ] All 3 property groups exist for each object type
- [ ] All ~60 contact custom fields created
- [ ] All ~12 company custom fields created
- [ ] All ~5 deal custom fields created
- [ ] All ~4 ticket custom fields created
- [ ] All 4 pipelines created with correct stages
- [ ] Fields are in correct property groups
- [ ] Select fields have all options
- [ ] Field names match documentation exactly
- [ ] Field visibility is enabled in views

---

## Troubleshooting

**Field not appearing in sync**
- Verify field name matches exactly (case-sensitive)
- Check field is not hidden in property settings
- Ensure API permissions include read/write for the object type

**Pipeline not showing stages**
- Verify pipeline is set as active
- Check stage display order is sequential
- Ensure default stage is set

**Multi-select options not saving**
- Check each option value is unique
- Verify option values don't exceed character limits
- Ensure field type is correctly set to Multi-select

**Property groups not organizing fields**
- Verify group name matches exactly
- Check group display order
- Ensure fields are assigned to groups when created

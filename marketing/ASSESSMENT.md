# Production-state diagnostic and pilot funnel

**Offer:** Make one live AI production team-operable: preserve its approved production state, keep creators on the correct inputs, and make approved work reproducible and transferable—without replacing the tools the team already uses.

Team-operable means another qualified creator can continue or extend approved work without reconstructing the original operator's context or repeatedly interrupting them. The economic framing is reduced coordination tax: context reconstruction, wrong-input generations, senior-team interruptions, handoff delays, and rework. Establish baselines before claiming savings.

## Source, stages, and field dictionary

Canonical URL: `/assessment`; `/workflow/assessment` remains a redirect. `assessment.v4` identifies the form and `assessment_version`. `frontend/src/lib/leads/assessment-definition.ts` is the authoritative field dictionary: IDs, labels, enum values, stages, required status, and branch predicates. Change labels without renaming IDs. The following stages progressively disclose questions:

| Stage | Fields |
| --- | --- |
| 1 Your production | Existing name/work email/company/role; `production_status`, `contributors_count`, solo `imminent_contributor_scaling`, early `pilot_readiness_30d` |
| 2 Transferability | `transferability_without_originator`, `time_to_transfer` |
| 3 Approved production state | `context_storage_locations`, `captured_production_state`, `execution_state_complete` |
| 4 Manual handoff | `manual_handoff_requirements`, `context_interrupt_owner` |
| 5 Production failures | `production_failures`, conditional `most_recent_incident`, `recreationFrequency` |
| 6 Production impact | `time_lost_per_incident`, `cost_bearer`, `recurringWorkflow`, optional `assetVolume`, optional `affected_work_value` |
| 7 Active workflows | `active_workflows`, `most_urgent_active_workflow`, conditional `agent_context_resolution` and optional detail |
| 8 Ownership and next steps | `production_type`, `workflow_role`, `ai_tools`, controlled-IP branch, `productionOwner`, `adoption_authority`, optional `approval_path_detail`, `primaryObjection`, optional `message` |

Captured state distinguishes prompts/models/settings/graphs from exact source versions, reference selection, approvals, client decisions, canonical outputs, dependencies, rights, and human instructions. Selecting fewer fields alone does not establish missing state: some fields are irrelevant to a workflow. `execution_state_complete` explicitly tests whether required operational state remains external.

Overall production-team size remains an optional `teamSize` question; legacy content fields remain stored and parseable. Workflow contributor count drives qualification; company size does not. `content_formats` is omitted because it has no recommendation/scoring dependency. No phone/social/portfolio requirement was added. Existing work-domain enrichment and validated identity URL prefill remain available. URL-supplied critical fields stay reviewable; an outbound link for a different email clears the previous profile’s diagnostic/draft context so one person cannot inherit another’s qualification.

## Branching, accessibility, and drafts

Reliable transfer **and** transfer under 30 minutes skip manual-handoff questions, but state-completeness/correctness checks remain. Controlled IP enables source-exposure and traceability questions. Agent-assisted production enables structured context resolution. Any failure except `none` requires a recent example; incident-free respondents skip it. Research-only productions skip economic and buying-owner details. Financial disclosure is optional. `none`, `nothing_significant`, and `nobody` are exclusive choices.

The UI, server validation, and scorer share declarative branch predicates. Visible stages determine progress. Controls stay mounted across navigation and branches; existing local drafts preserve answers, including unique checkbox names. Inactive branches are stripped at submission/scoring. Current assessments replace earlier diagnostic answers so hidden stale pain cannot return. Labels/legends, progress semantics, error announcements/focus, keyboard controls, and responsive grids are retained. Prefilled critical identity stays reviewable.

## Scoring and routing

`assessment-diagnostic.ts` uses fixed maxima rather than normalizing unanswered fields upward:

| Operational fit/pain | Max |
| --- | ---: |
| Live/imminent production | 10 |
| Actual contributors or imminent scaling | 8 |
| Tool/state complexity | 7 |
| Required state fragmentation | 12 |
| Transferability gap | 12 |
| Failure/rework frequency | 8 |
| Recurrence/variants | 5 |
| Time/economic impact | 8 |
| **Operational total** | **70** |
| Ability to test within 30 days | 10 |
| Identified production owner | 5 |
| Understood approval/adoption path | 5 |
| Optional affected-work value | 5 |
| Specific urgent workflow | 5 |
| **Commercial total** | **30** |

The stored `breakdown` gives deterministic contributions. Unknown/untested answers are not affirmative pain. Company size earns no points; affected value cannot create a problem. Legacy fit/pain/intent projections remain for integrations; v4 fit/pain project operational fit and intent projects readiness. `assessmentScore(scores)` returns v4 totals out of 100, while historical records retain the legacy 24-point score. Segment analysis by version.

Caps: research-only ≤49; solo without imminent scaling ≤44; no meaningful production-state problem ≤39. A solo exception requires an observed correctness/reproduction/provenance failure, weekly/daily recurrence, and at least one day lost per incident. Solo exceptions never qualify as High without scaling. Excellent transfer never hides independent correctness, reproduction, rights, or agent-context evidence.

**High:** ≥70 plus live/within 30 days, multiple contributors or imminent scaling, meaningful operational-state problem, yes/possibly for a test, identified owner, understood approval path, and a specific urgent workflow. Public label: “Strong production-pilot candidate.”

**Mid:** ≥50 with a meaningful problem but a High gate missing, including later production, unavailable near-term testing, or missing sponsor. Public label: “Potential production-pilot fit.” High and Mid continue to `/pilot?from=assessment#scope`, with optional assisted review.

**Low:** <50 or fundamental state qualification absent. Explain calmly why deployment is premature, offer `/use-cases`, `/production-memory`, and reassessment. Public results/downloads lead with actual reasons and an answer-derived intervention. Internal scores, caps, signal taxonomy, and evidence codes are omitted from public API/profile context.

## Internal signals

Independently store overlapping booleans and evidence codes in the diagnostic score:

- `A_STATE_PERSON_DEPENDENT`: substantial originator handoff, undocumented creator memory, or manual context plus interruptions.
- `B_MISSING_GENERATIVE_STATE`: required external state, reproduction/R&D failures, manually transferred source versions that are not captured, missing required rights lineage, or non-deterministic agent context.
- `C_THROUGHPUT_CORRECTNESS`: wrong inputs, drift, duplicate work/retries, client-review failures, or recurring manual reconstruction.

Use these for completion, pilot application/approval, revenue, and use-case cohorts. Do not expose letters/categories to prospects. Provenance remains targeted to risk signals.

## Persistence and compatibility

No PostgreSQL migration is required: additive fields use existing encrypted submission/profile payloads and scores JSON. No historical rows are rewritten/deleted. Historical schemas, tool counts, active-workflow IDs, financial ranges, raw submissions, retention, consent, attribution, profile identity, and durable outboxes remain supported.

Apollo changes are additive in `frontend/config/apollo-lead-operations.json`; `contactFields` projects diagnostic answers, total/component scores, signal booleans/evidence, bottleneck, and baseline through the verified-submission outbox. Existing labels remain stable. Run the idempotent provisioner and verify remote fields before production use. Missing remote credentials/network blocks provisioning, not local persistence.

## Pilot handoff and measurement

`pilotAssessmentPrefill` carries selected workflow, tools, timing, approval path, bottleneck, and reported baseline into the existing pilot application. `PilotScopeForm` preserves those fields; `PilotApprovalRoom` shows bottleneck/baseline with the live workflow, scope, requirements, terms, adjustment/reviewer mechanisms, and approval action. Suggested success criteria are an editable measurement checklist, never accepted savings or targets. `ProgressiveAssessmentFields` skips the historical diagnostic for v4 applicants and shows their baseline instead; direct and legacy applicants retain existing progressive qualification. High/Mid do not require a call; existing implementation/security exceptions may require assisted validation.

Compare before/after: creator time to productivity, original-creator interruptions, reconstruction and handoff time, wrong-reference/version failures, reproduction success, retries caused by missing state, percentage of required state captured, recurrence, and senior-operator coordination burden. Agree the applicable-state denominator, measurement window, and target before claiming percentages or savings.

## Analytics and privacy

Existing consent-gated Mixpanel browser events: `assessment_viewed`, `assessment_started`, `assessment_stage_completed`, `assessment_branch_entered`, `pilot_application_started`, `pilot_room_entered`, `pilot_terms_viewed`, `pilot_terms_adjustment_requested`, `pilot_assisted_review_requested`, `pilot_approved`. Stage IDs remain stable when stages are skipped. Adjustment/approval events fire only after successful room actions. Room browser observations are not commercial authority; persisted room history remains the source of truth.

Verified submission outbox events: `assessment_submitted`, `assessment_result_high`, `assessment_result_mid`, `assessment_result_low`, `pilot_application_submitted`. Historical completion/request events remain. Server events use submission IDs for deduplication and include score/components, internal signal booleans, production status, contributors, first selected structured workflow, UTM/source attribution, completion seconds, and assessment version. Do not send free text, incident examples, workflow descriptions, identity, or evidence details to browser analytics. Consent gates remain in both client tracking and durable outbox processing.

## Future changes and validation

Edit definitions first; retain IDs, declare branches, update scoring/explainability, schema, CRM config/projection/provisioning, pilot prefill, and fixtures together. `/api/leads` uses `validatedLeadRequestSchema` for current required/conditional fields; UI-required controls are insufficient. Older versions remain parseable.

Run from the repository root:

```sh
npm --workspace frontend run test:leads
npm --workspace frontend run typecheck
npm --workspace frontend run check:marketing
npm --workspace frontend run build
npm --workspace frontend run provision:apollo
```

There is no dedicated frontend lint script. Use the marketing checker, TypeScript, and whitespace checks. Representative fixtures cover High A, mature VFX B, throughput C, future-ready Mid, solo research, large-company false positives, and state-complete workflows; tests also cover branches, validation, drafts/persistence, compatibility, explainability, prefill, analytics/privacy, CRM projection, and PDF rendering.

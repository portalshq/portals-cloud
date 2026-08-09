# Portals lead operations

The website accepts every form through `POST /api/leads`. A submission is encrypted and committed to the marketing-intake database before the browser receives success. Attio, Resend, and server-side Mixpanel work is then performed from an idempotent outbox.

The public funnel has three canonical paths: `/ai-production-workflow-risks` for education and the Field Guide, `/assessment` for qualification and a personalized assessment result, and `/paid-pilot` for pilot scope, the customized pilot packet, and scheduling. `/use-cases` is a compatibility redirect to the workflow-risks page. The production-team pricing CTA routes to the assessment; the paid pilot and higher-touch packages route to pilot scope. Security and contact remain supporting pages, not separate qualification funnels.

## Launch order

1. Provision a separate managed PostgreSQL database and run `npm --workspace frontend run migrate:leads`.
2. Create the Attio lists and attributes in `config/attio-lead-operations.json`. Set `ATTIO_CUSTOM_ATTRIBUTES_ENABLED=true` only after every custom API slug exists.
3. Configure and verify the Resend sending domain. Use a monitored sender and founder-notification address.
4. Add Vercel environment values from `.env.example`, deploy, then verify the cron endpoint and outbox retries.
5. Enable the Mixpanel browser and server tokens only after the privacy text is published.

Generate `LEADS_HASH_KEY` as a high-entropy secret. Generate `LEADS_ENCRYPTION_KEY` as exactly 32 random bytes encoded with base64. Do not reuse application-database credentials. When rotating the encryption key, increment `LEADS_ENCRYPTION_KEY_ID` and retain prior keys in `LEADS_ENCRYPTION_KEYRING`, for example `{"v1":"<old base64 key>"}`, until every retained record has been re-encrypted or deleted.

For local UI work, `LEADS_DRY_RUN=true` is the only supported no-integration mode. It is disabled in production and every response is visibly labeled as a dry run.

`LEADS_ALLOWED_ORIGINS` is an optional comma-separated allowlist for explicit preview or private-network origins. Production does not accept wildcard origins.

For device testing through a local-network hostname, add that hostname to `NEXT_ALLOWED_DEV_ORIGINS`; this only controls Next.js development assets.

## Workflow assessment

The assessment runs as a native React form (`src/components/leads/AssessmentForm.tsx`) at `/assessment`, so it shares the site's type, styling, draft persistence, and consent controls. It submits through `POST /api/leads` with `provider: browser`, is verified on arrival, and can open the progressive workflow-review form for medium and incomplete results.

The form asks these canonical questions with these values:

| Label | Canonical values |
| --- | --- |
| team type | `agency`, `creative-studio`, `production-company`, `in-house-creative`, `brand-marketing`, `film-animation`, `game-entertainment`, `independent-creator`, `other` |
| production team size | `1`, `2-4`, `5-9`, `10-24`, `25-plus` |
| number of people involved in production | `1`, `2-4`, `5-9`, `10-plus` |
| number of ai creative tools used | `1`, `2`, `3-4`, `5-plus` |
| current approved version method | `canonical-system`, `documented-review`, `folder-naming`, `chat-spreadsheet`, `creator-memory`, `inconsistent` |
| where generation context is stored | `attached-record`, `project-document`, `multiple-tools`, `chat-personal-notes`, `memory-inconsistent` |
| frequency of rediscovery recreation | `never`, `quarterly`, `monthly`, `weekly`, `daily` |
| most recent incident | `none`, `version-confusion`, `missing-context`, `failed-reproduction`, `recreated-work`, `other` |
| active workflow to test | text |

When the frequency is not `never` and the incident is not `none`, the form also asks `people affected`, `hours lost`, and `delivery client impact` using the canonical values in `src/lib/leads/scoring.ts`. `annual affected value` is optional, range-based, and excluded from scoring. `optional message` is the only free-text assessment follow-up.

The server derives progressive context in `getKnownLeadContext` (`src/lib/leads/profile.ts`) from the verified same-browser profile: known identity fields, previously answered questions, qualification scores, tier, recommended workflow, and whether the incident block is eligible. The form hides those questions. Same-browser behavior (`pricing_or_pilot_viewed`, `security_diligence`) is captured from local storage with a 90-day expiry, never asked, and never placed in URLs. Opaque profile data is never placed in hidden fields or URLs.

### Verification checklist

1. `npm run typecheck` and `npm run test:leads` pass.
2. `LEADS_DRY_RUN=true` with the dev server; submit a sample from `/assessment` and confirm the breakdown renders with a production-memory risk `/24` and the correct tier CTA.
3. On production after deployment, submit a real sample and confirm the submission arrives at `/api/leads`, the outbox completes, the Attio person/company are created, the person is added to `production-assessments`, the attributes and note are populated, and `qualification_score` lands in the 0-24 range.
4. Review the first 20 to 30 submissions manually before adjusting any scoring or thresholds.

## Personalized documents

`GET /api/leads/documents/assessment-result` creates a private assessment PDF from the verified qualification snapshot. `GET /api/leads/documents/pilot-packet` creates a ZIP containing a two-page customized pilot brief and the current security brief. Both endpoints require the opaque same-browser profile cookie and return `Cache-Control: private, no-store`.

The pilot form is the only pilot transaction. It asks unanswered assessment questions plus pilot-specific scope fields that are not already present, stores the combined record, then returns the packet URL and `PILOT_CALENDAR_URL`. The security brief is fetched from the configured GitHub PDF base URL while the ZIP is generated, so the deployed application does not bundle resource PDFs.

The assessment and pilot documents may show an annualized time-at-risk scenario only when the respondent supplied both a recreation-frequency range and a time-loss range. The result is labeled as a self-reported validation scenario, not a benchmark, guaranteed savings estimate, or ROI promise.

## Attio operations

### CRM preparations

Before enabling `ATTIO_CUSTOM_ATTRIBUTES_ENABLED`, create the lists and attributes in `config/attio-lead-operations.json` and add every custom API slug in Attio:

- Lists: `inbound-leads`, `guide-downloads`, `production-assessments` (people, history on); `nurture`, `qualified-opportunities`, `pilot-requests`, `paid-pilots` (manual), `customers` (manual) (companies). People keep historical membership in the three people lists; companies reconcile into at most one operational list.
- People attributes: `lead_intent` (select), `cta_label` (text), `source_page` (text), `use_case_interest` (multi-select), `qualification_score` (number, 0-24 composite risk), `qualification_tier` (select, people and companies), `production_role` (text), `company_type` (select), `team_size` (select), `tools_used` (text, raw answer string), `approved_version_method` (select), `production_context_method` (select), `recreation_frequency` (select), `active_workflow` (text, workflow description), `timeline` (select), `message` (text, multiline), `utm_source` / `utm_campaign` (text), `first_touch_page` / `last_touch_page` (text, people and companies), `last_cta_clicked` (text), `lifecycle_stage` (select, people and companies), `recommended_next_action` (select, people and companies), `marketing_consent` / `analytics_consent` (checkbox).
- Company attributes: `fit_score`, `pain_score`, `intent_score` (number), `qualifying_submission_id` (text), plus the shared `qualification_tier`, `recommended_next_action`, `first_touch_page`, `last_touch_page`.
- Deal attribute: `portals_submission_id` (text, unique), used to upsert paid-pilot deals.

The assessment score is a pure composite of the three normalized qualification dimensions (`fit` 40, `pain` 35, `intent` 25) scaled to 0-24. It is derived at score time from the same answers, so it can never drift out of sync with the stored dimensions; there is no separate score calculation to reconcile. Routing decisions use the qualification tier, not the composite.

The controller upserts People by normalized email and Companies by normalized business domain. Public email providers require a website and are never used as company identities. It appends a note for each submission and leaves Attio descriptions, company names, job titles, and manual commercial fields untouched.

People retain historical membership in Inbound Leads, Guide Downloads, and Production Assessments. Companies are reconciled into at most one operational list. Automated lifecycle updates are monotonic through Pilot Requested: later low-intent activity cannot demote either a Person or Company, and founder-controlled stages are never overwritten. Founder-controlled stage changes remain in Attio for v1.

Create one Attio workflow for tasks, sequences, and founder notification. Guard every action with the submission ID so retries are harmless. High-fit assessments trigger the founder-notification email as the follow-up signal for v1; automated Attio task creation is deferred to a later phase. Trigger the appropriate requested-delivery sequence. Proposal sent, payment received, meeting outcome, pilot accepted, and annual contract won remain manual authoritative changes in Attio for v1.

The same workflow may report those authoritative changes to `POST /api/leads` as a `commercial_event`. Send `x-portals-signature` as the base64url HMAC-SHA256 of the exact request body using `ATTIO_CALLBACK_SECRET`. Supported event values are `meeting_booked`, `pilot_proposed`, `pilot_accepted`, `annual_contract_sent`, and `annual_contract_won`. Include the known work email, an idempotency key tied to the Attio action, numeric revenue only when applicable, and no free text. The intake service preserves the profile's stored consent instead of trusting consent flags from the callback.

## Analytics and reporting

Browser Mixpanel starts only after analytics consent and uses the opaque intake profile ID. Never add email, names, messages, assessment answers, or workflow descriptions to analytics properties.

Build funnel reports for `page_viewed`, `cta_clicked`, `form_opened`, `form_started`, `form_submitted`, `guide_downloaded`, `assessment_completed`, `qualification_assigned`, `calendar_shown`, `meeting_booked`, `pilot_requested`, `pilot_proposed`, `pilot_accepted`, `annual_contract_sent`, and `annual_contract_won`.

The primary report is paid-pilot revenue per distinct qualified company grouped by first-touch source. Keep last-touch reporting separate. Review the first 20 to 30 assessments manually before changing score mappings or thresholds; never move thresholds automatically from a median.

## Operations

Vercel invokes `/api/internal/leads/retry` every ten minutes with `CRON_SECRET`. A worker claim has a ten-minute lease, so work interrupted by a serverless timeout is reclaimed automatically. After six handled failures an outbox action is marked dead and a separate founder alert is attempted. Inspect `lead_outbox.last_error`, correct the provider configuration, and set the row back to `retry` with `next_attempt_at = now()` to replay it.

Raw encrypted submission payloads are redacted after 30 days once all outbox work completes. The opaque same-browser profile cookie expires after 90 days and can be reset from any progressive form.

Verified progressive answers are also kept as one encrypted qualification snapshot on the lead profile. Blank values from hidden fields never replace known answers. The snapshot is the source for later form omission and personalized documents; deleting the lead profile deletes it with the rest of the profile data.

An unchecked marketing box on a later transactional request does not revoke an earlier opt-in. Record an unsubscribe by setting `marketing_consent = false`, `marketing_suppressed = true`, and `consent_withdrawn_at` on the lead profile; suppression prevents later forms from silently re-subscribing the person. Consent version and source page are recorded on every profile update.

# Portals lead operations

The website accepts every form through `POST /api/leads`. A submission is encrypted and committed to the marketing-intake database before the browser receives success. Attio, Resend, and server-side Mixpanel work is then performed from an idempotent outbox.

The public funnel has three canonical paths: `/ai-production-workflow-risks` for education and the Field Guide, `/workflow-assessment` for qualification and a personalized assessment result, and `/paid-pilot` for pilot scope, the customized pilot packet, and scheduling. `/use-cases` is a compatibility redirect to the workflow-risks page. The production-team pricing CTA routes to the assessment; the paid pilot and higher-touch packages route to pilot scope. Security and contact remain supporting pages, not separate qualification funnels.

## Launch order

1. Provision a separate managed PostgreSQL database and run `npm --workspace frontend run migrate:leads`.
2. Create the Attio lists and attributes in `config/attio-lead-operations.json`. Set `ATTIO_CUSTOM_ATTRIBUTES_ENABLED=true` only after every custom API slug exists.
3. Configure and verify the Resend sending domain. Use a monitored sender and founder-notification address.
4. Create the Tally assessment below, add its signing secret, and direct its webhook to `https://portals.works/api/leads`.
5. Add Vercel environment values from `.env.example`, deploy, then verify the cron endpoint and outbox retries.
6. Enable the Mixpanel browser and server tokens only after the privacy text is published.

Generate `LEADS_HASH_KEY` and `TALLY_CONTEXT_SECRET` as independent high-entropy secrets. Generate `LEADS_ENCRYPTION_KEY` as exactly 32 random bytes encoded with base64. Do not reuse application-database credentials. When rotating the encryption key, increment `LEADS_ENCRYPTION_KEY_ID` and retain prior keys in `LEADS_ENCRYPTION_KEYRING`, for example `{"v1":"<old base64 key>"}`, until every retained record has been re-encrypted or deleted.

For local UI work, `LEADS_DRY_RUN=true` is the only supported no-integration mode. It is disabled in production and every response is visibly labeled as a dry run.

`LEADS_ALLOWED_ORIGINS` is an optional comma-separated allowlist for explicit preview or private-network origins. Production does not accept wildcard origins.

For device testing through a local-network hostname, add that hostname to `NEXT_ALLOWED_DEV_ORIGINS`; this only controls Next.js development assets.

## Tally assessment

Create one embedded form with these required questions and stable field labels:

| Label | Canonical values |
| --- | --- |
| work email | email |
| company | text |
| role | the role values used by website forms |
| company website | URL; show when no known website is available |
| team type | `agency`, `creative-studio`, `production-company`, `in-house-creative`, `brand-marketing`, `film-animation`, `game-entertainment`, `independent-creator`, `other` |
| production team size | `1`, `2-4`, `5-9`, `10-24`, `25-plus` |
| number of people involved in production | `1`, `2-4`, `5-9`, `10-plus` |
| number of ai creative tools used | `1`, `2`, `3-4`, `5-plus` |
| current approved version method | `canonical-system`, `documented-review`, `folder-naming`, `chat-spreadsheet`, `creator-memory`, `inconsistent` |
| where generation context is stored | `attached-record`, `project-document`, `multiple-tools`, `chat-personal-notes`, `memory-inconsistent` |
| frequency of rediscovery recreation | `never`, `quarterly`, `monthly`, `weekly`, `daily` |
| most recent incident | `none`, `version-confusion`, `missing-context`, `failed-reproduction`, `recreated-work`, `other` |
| active workflow to test | text |

When the frequency is not `never` and the incident is not `none`, ask `people affected`, `hours lost`, and `delivery client impact` using the canonical values in `src/lib/leads/scoring.ts`. `annual affected value` is optional, range-based, and excluded from scoring. `optional message` is the only free-text assessment follow-up.

Add hidden fields for `source_page`, `cta_label`, `use_case`, all five UTM fields, `referrer`, `known_profile`, `known_email`, `known_company`, `known_role`, `known_website`, `requires_website`, `analytics_consent`, `pricing_or_pilot_viewed`, `security_diligence`, and `portals_context`. The two behavior fields contain only same-browser booleans with a 90-day expiry. Use Tally conditional visibility to hide known identity fields. Show company website when `requires_website` is true or `known_website` is false. Never place email, Attio IDs, or other personal data in hidden fields or URLs.

Also create boolean hidden fields named `known_team_type`, `known_production_team_size`, `known_workflow_collaborators`, `known_tools_used`, `known_approved_version_method`, `known_production_context_method`, `known_recreation_frequency`, `known_most_recent_incident`, `known_people_affected`, `known_hours_lost`, `known_delivery_client_impact`, `known_recurring_workflow`, `known_asset_volume`, `known_annual_affected_value`, and `known_active_workflow_to_test`. Use them to hide questions already answered in a verified same-browser submission. These flags reveal only that a value exists; they never contain the answer.

The browser `Tally.FormSubmitted` event only produces a provisional result. The signed webhook is authoritative and is the only Tally path that queues CRM or email work. Medium and incomplete verified results can open the progressive workflow-review form; it asks only for review fields that remain unknown.

## Personalized documents

`GET /api/leads/documents/assessment-result` creates a private assessment PDF from the verified qualification snapshot. `GET /api/leads/documents/pilot-packet` creates a ZIP containing a two-page customized pilot brief and the current security brief. Both endpoints require the opaque same-browser profile cookie and return `Cache-Control: private, no-store`.

The pilot form is the only pilot transaction. It asks unanswered assessment questions plus pilot-specific scope fields that are not already present, stores the combined record, then returns the packet URL and `PILOT_CALENDAR_URL`. The security brief is fetched from the configured GitHub PDF base URL while the ZIP is generated, so the deployed application does not bundle resource PDFs.

The assessment and pilot documents may show an annualized time-at-risk scenario only when the respondent supplied both a recreation-frequency range and a time-loss range. The result is labeled as a self-reported validation scenario, not a benchmark, guaranteed savings estimate, or ROI promise.

## Attio operations

The controller upserts People by normalized email and Companies by normalized business domain. Public email providers require a website and are never used as company identities. It appends a note for each submission and leaves Attio descriptions, company names, job titles, and manual commercial fields untouched.

People retain historical membership in Inbound Leads, Guide Downloads, and Production Assessments. Companies are reconciled into at most one operational list. Automated lifecycle updates are monotonic through Pilot Requested: later low-intent activity cannot demote either a Person or Company, and founder-controlled stages are never overwritten. Founder-controlled stage changes remain in Attio for v1.

Create one Attio workflow for tasks, sequences, and founder notification. Guard every action with the submission ID so retries are harmless. Create a follow-up task for a high-tier assessment and trigger the appropriate requested-delivery sequence. Proposal sent, payment received, meeting outcome, pilot accepted, and annual contract won remain manual authoritative changes in Attio for v1.

The same workflow may report those authoritative changes to `POST /api/leads` as a `commercial_event`. Send `x-portals-signature` as the base64url HMAC-SHA256 of the exact request body using `ATTIO_CALLBACK_SECRET`. Supported event values are `meeting_booked`, `pilot_proposed`, `pilot_accepted`, `annual_contract_sent`, and `annual_contract_won`. Include the known work email, an idempotency key tied to the Attio action, numeric revenue only when applicable, and no free text. The intake service preserves the profile's stored consent instead of trusting consent flags from the callback.

## Analytics and reporting

Browser Mixpanel starts only after analytics consent and uses the opaque intake profile ID. Never add email, names, messages, assessment answers, or workflow descriptions to analytics properties.

Build funnel reports for `page_viewed`, `cta_clicked`, `form_opened`, `form_started`, `form_submitted`, `guide_downloaded`, `assessment_completed`, `qualification_assigned`, `calendar_shown`, `meeting_booked`, `pilot_requested`, `pilot_proposed`, `pilot_accepted`, `annual_contract_sent`, and `annual_contract_won`.

The primary report is paid-pilot revenue per distinct qualified company grouped by first-touch source. Keep last-touch reporting separate. Review the first 20 to 30 assessments manually before changing score mappings or thresholds; never move thresholds automatically from a median.

## Operations

Vercel invokes `/api/internal/leads/retry` every ten minutes with `CRON_SECRET`. A worker claim has a ten-minute lease, so work interrupted by a serverless timeout is reclaimed automatically. After six handled failures an outbox action is marked dead and a separate founder alert is attempted. Inspect `lead_outbox.last_error`, correct the provider configuration, and set the row back to `retry` with `next_attempt_at = now()` to replay it.

Raw encrypted submission payloads are redacted after 30 days once all outbox work completes. Unverified provisional Tally submissions expire after 24 hours. The opaque same-browser profile cookie expires after 90 days and can be reset from any progressive form.

Verified progressive answers are also kept as one encrypted qualification snapshot on the lead profile. Blank values from hidden fields never replace known answers. The snapshot is the source for later form omission and personalized documents; deleting the lead profile deletes it with the rest of the profile data.

An unchecked marketing box on a later transactional request does not revoke an earlier opt-in. Record an unsubscribe by setting `marketing_consent = false`, `marketing_suppressed = true`, and `consent_withdrawn_at` on the lead profile; suppression prevents later forms from silently re-subscribing the person. Consent version and source page are recorded on every profile update.

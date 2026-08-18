# Lead funnel and CRM projection

- The application database is the system of record: lead profiles, application users, customer accounts, pilot rooms, memberships, payment, consent, raw submissions, and audit history live here. Apollo is a sales-facing projection, never the source for application state.
- A verified lead submission is persisted first, then processed through `lead_outbox`. A successful form response does not prove external work completed; outbox actions retry independently.
- Apollo sync is Contact-first. Every verified browser lead submission creates or updates the Apollo Contact before any Account or Deal work. The Contact receives standard identity fields, native Contact stage when available, lists, consent, attribution, latest submission metadata, qualification state/tier, fit/pain/intent scores, next action, and current form answers.
- Apollo Accounts are created or updated after the Contact for every verified lead with a company name and a non-public company domain or website. The app deduplicates the prospect Account by that normalized domain and links the Contact immediately. When a pilot approval room creates a real `customer_account`, its local mapping is attached to the same Apollo Account; generic-email leads without a company website do not create an Account. The Account receives company-level scores, qualification state/tier, next action, canonical first/last-touch URLs, native Account stage when available, and operational account lists.
- Apollo Deals are created or updated only after Contact and Account sync succeed. The app links the Deal to both records and advances Deal stages from app-owned events: `Pilot Requested`, `Paid Pilot`, and `Customer`.
- Apollo custom fields, lists, and native stage name assumptions are declared in `frontend/config/apollo-lead-operations.json`; provision/runtime discovery use labels. Apollo's Fields endpoint returns namespaced IDs, so the sync removes the `contact.` / `account.` / `opportunity.` prefix before placing an ID in `typed_custom_fields`. The config is the definitive list of custom-field values produced by the app.
- Apollo is updated from durable verified submissions and app events through `lead_outbox` / `crm_outbox`, not directly from analytics page-view events. Analytics can inform future scoring only after becoming app-owned submission or event data.
- Preserve `crm_external_records` as the local Apollo-ID ledger and `crm_outbox` for retries. Do not query Apollo as reconciliation/source-of-truth and do not dual-write to Attio.
- Do not enable Apollo `run_dedupe` when creating contacts. It can match on non-email data and overwrite a different person. Application email identity plus the local ID ledger provide the safe deduplication boundary.
- Mixpanel analytics is consent-gated and separate from CRM. Client identifiers/attribution support analytics only; do not use them as CRM identity.

## Progressive qualification fields

All website forms collect two qualification questions:
- `whatBroughtYouHere`: Enum value indicating primary motivation (workflow-problem, assess-scaling, evaluating-tools, other)
- `whatBroughtYouHereOther`: Free-text detail when "other" is selected
- `howDidYouHearAboutPortals`: Enum value indicating discovery channel (google-search, linkedin, email, someone-company, friend-colleague, article-newsletter-podcast, partner-company, social-media)

These fields are stored at the lead submission level (both in encrypted payload and in dedicated database columns) and projected to Apollo Contact custom fields for sales context.

## Apollo deal role mapping

Pilot submissions map team-member fields to Apollo deal contact roles:
- Identity name/email → `Initial Contact`
- Production owner name/email → `Project Manager`
- Economic buyer name/email → `Buyer`
- Technical evaluator name/email → `Evaluator`
- Approver name/email → `Decision Maker`
- Signer name/email → `Contract Signer`

Role entries are only emitted when both name and email are present. The mapped roles are serialized into the Apollo opportunity custom field `Deal contact roles` as a JSON array until native Apollo contact-role API endpoints are identified and integrated.

## Production owner email

The pilot controlled fields include `productionOwnerEmail` as a required field. This email is persisted in the `lead_pilots` table, used for reviewer invitations, and projected to the Apollo Contact custom field `Production owner email`.

## Apollo provisioning

Run `npx tsx scripts/provision-apollo.ts` after adding or modifying custom fields in `config/apollo-lead-operations.json`. The script reads `.env.local`, requires `APOLLO_API_KEY`, and creates missing labels, custom fields, and deal stages. Existing fields are not modified.

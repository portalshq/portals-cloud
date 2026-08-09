## Objective
- Revise the customized paid pilot brief into a zero-call-first system: a zero-call standard package ($5,000) plus a one-call exception package, replacing the PDF-first funnel with a personalized Pilot Approval Room that ends in confirm → sign → pay → kickoff.
- Phases: foundations (spec boundary, pilot record, contracts, classifier) → staged PilotScopeForm + landing rewrite → approval room → revised PDF → transaction emails → click-to-sign + Stripe + kickoff → Attio mirror → verify.

## Important Details
- Repo: `/Users/vibrantceo/Projects/portals/cloud/frontend` (Next.js app in portals/cloud monorepo). All forms POST `/api/leads` → Postgres (lead_profiles/lead_submissions/lead_outbox) → Attio + Resend + Mixpanel via idempotent outbox (`processLeadOutbox`).
- Payments = **Stripe Checkout**; e-sign = **free self-contained click-to-sign** (typed signature + identity + consent + frozen PDF, E-SIGN-valid); Google no native e-sign, skipped.
- Consolidations committed: stateless HMAC room tokens (no token table); `history` JSONB on pilot row (no events table); one email function with variants; one staged form component reused by landing + revision; one `PATCH /api/pilot/[id]` action enum; classifier + transition map in one lib file; inline sign panel inside approval room; security matrix inside single personalized PDF; extend existing Attio deal — no new CRM objects.
- Target funnel — standard: inquiry → config form → approval room → confirm/edit scope → standard agreement → sign → pay → kickoff. Exception: inquiry → room → request nonstandard terms → classify/summarize exceptions → one **Pilot Terms Review** call → resolve → sign + pay.
- Zero-call eligible only when: 1 active workflow, 1 historical project, ≤5 participants, standard duration, standard import/integration, no custom engineering, no regulated/prohibited data, standard security + legal accepted, signer identified, $5,000 approval path confirmed, annual price acknowledged, supported payment, standard success criteria. One-call triggers: custom integration, dedicated infra, SSO, data residency, regulated data, custom SLA, legal redlines, procurement complexity, extra participants/projects, unusual reproduction, custom success criteria, annual pricing disagreement, missing economic buyer, conflicting stakeholders, internal-build comparison. Disqualify: no active workflow, no production owner, no credible approval path, exact-reproduction guarantee.
- State model: reviewing → revision → exception_review → scope_confirmed → ready_sign → signed → paid → kickoff → active; plus not_eligible. Transitions in `TRANSITIONS` map: reviewing{revise,confirm_scope,request_exception}, revision{revise→reviewing,confirm_scope,request_exception}, exception_review{resolve_exceptions→reviewing,revise→revision}, scope_confirmed{finalize→ready_sign,request_exception,revise}, ready_sign{sign,revise}, signed{pay}, paid{kickoff}, kickoff{activate}, active{}, not_eligible{}.
- Commercial block: $5,000, due on signature, 21-day term, named participants, integration method, annual option **Studio $30,000/yr**, $5,000 credit if annual signed by decision deadline + 6 days, decision date = term end.
- Standard package boundary (published to Sanity paid-pilot spec): included = 1 production team, 1 active workflow, 1 historical project, up to 5 participants, 1 standard import/integration path, defined asset/storage limits, standard repo config, 1 kickoff, 1 onboarding, 21-day support, 1 final evaluation, standard agreement + security docs. Excluded without amendment = custom dev, dedicated infra, customer-managed keys, custom SLA/recovery, >1 integration, complex migration/cleansing, regulated data, bespoke legal/security controls, extra projects/participants, on-site implementation.
- Success criteria: 5 components (Test, Participant, Baseline, Target, Evidence); buyer selects Accept / Modify / Not applicable / Add. Value calc auditable (frequency × hours lost × affected people, low/high + midpoint, customer confirmation).
- Form stages: 1 Eligibility → 2 Scope → 3 Success → 4 Purchase → 5 Confirmation (pre-submission summary). Budget question: "can your organization approve the $5,000 pilot?" with branching (approver name/role/email/share-now; PO/vendor setup/review time/docs). Annual acknowledgment checkbox wording: "I acknowledge that the proposed post-pilot deployment is the selected annual package at the displayed annual price, and that the $5,000 pilot fee is credited if the annual order form is signed by the decision deadline."
- CTA migration: hero "Build Your Pilot Plan"; post-submit "Review My Pilot Plan" → later "Sign and Fund the Pilot"; PDF secondary "Download a PDF copy"; sequence Scope → Build → Review → Confirm → Sign. PDF renamed: "Proposed Portals Production Pilot Plan" → after acceptance "Portals Production Pilot Order Form and Statement of Work"; placeholders marked "Incomplete — not eligible for signature".
- Email = transaction controller (room link, packet URL, security brief, confirm/request-changes/schedule-review; then order form/terms/signature/payment/kickoff). Founder notification now includes pilot route/state/unresolved/exceptions.
- Sanity (projectId `bnqswm24`, dataset `production`): paid-pilot spec `8PZUX3ShTf5214Jw1trnB4` patched + published with includedItems/excludedItems/standardIntegrationPaths; Studio `22uPhQi95aN0jC0OXsMZKT` ($2,500/mo billed annually = **$30,000/yr**, 20 members, 15 repos); Production Team `AbE0eRTxRWYSaELT1SuSWw`; Enterprise `AbE0eRTxRWYSaELT1SuSig`; resource doc paid-pilot `AbE0eRTxRWYSaELT1QnxxS`.
- Env: `PILOT_PRICE_AMOUNT=5000`, `PILOT_CALENDAR_URL`, `PILOT_ROOM_SECRET` (new, for HMAC room tokens; required for share emails + room links), `ATTIO_PILOT_STAGE="Pilot Requested"`, `ATTIO_DEAL_SUBMISSION_ATTRIBUTE=portals_submission_id`.
- Typecheck: `npx tsc -p tsconfig.json --noEmit`. Lead tests: `node --import tsx --test src/lib/leads/*.test.ts` (42 tests, all pass; `LEADS_DRY_RUN=true` per file). Build: `npx next build` (passes; pilot routes register as dynamic).

## Work State
### Completed
- Foundations: `src/types/resource.ts` boundary fields; Sanity schema + paid-pilot doc `8PZUX3ShTf5214Jw1trnB4` published; `migrations/003_pilot_rooms.sql`; `src/lib/leads/pilot.ts` (classifier, TRANSITIONS state machine, success criteria, security matrix, auditable value model, commercial snapshot, unresolved, proposal summary — crypto-free); `src/lib/leads/pilot-tokens.ts` (HMAC room tokens, `PILOT_ROOM_SECRET`); `pilot.test.ts` (19 tests).
- Contracts/store/email/processor/route: `pilotControlledFields`/`pilotRequestAnswersSchema` (TDZ fixed), `pilotId` on pilot_request; pilot CRUD + `enqueuePilotEmail` (action_key dedup); email variants + `sendPilotShareEmail` + founder notification; `pilot_email` dispatch; `syncPilotRecord` (create + revision paths) in `/api/leads`.
- Staged form + landing: `src/components/leads/PilotScopeForm.tsx` (5 stages, stepper, live classification preview, revision mode, success screen honoring pilotUrl/route); `PaidPilotLandingPage.tsx` rewritten to render it (monolithic form removed); PDF two-page constraint fixed via clip limits.
- **Approval room (this milestone)**: `app/api/pilot/[id]/route.ts` — PATCH action enum (`update`, `confirm_scope`, `revise`, `request_exception`, `resolve_exceptions`, `finalize`, `sign`, `pay`, `kickoff`, `activate`, `share`); `verifyRoomToken` gate (401); recompute of route/exceptions/unresolved/criteria/security/proposal on answers/startDate change; 422 gate on unresolved items for `confirm_scope`; signing records name/email/consent/IP; emails enqueued for exception/ready_sign/paid/kickoff variants; share sends personalized room link. `app/pilot/[id]/page.tsx` — token-gated render of the room (invalid link → explainer). `app/pilot/[id]/revise/page.tsx` — reuses `PilotScopeForm` with `initialAnswers` + `pilotId` (revision resubmission → `syncPilotRecord`). `src/components/leads/PilotApprovalRoom.tsx` — state header + route badge, unresolved/exceptions lists, scope summary (editable start date), success-criteria editor (Accept/Modify/Not applicable + target/participant/evidence), security matrix, commercial terms + auditable value + "confirm estimate" checkbox, share box (approver/participant/signer), per-state action buttons, inline sign panel (name/email/consent), activity log.
- `src/lib/leads/room.test.ts`: 3 integration tests (full confirm→finalize→sign→pay→kickoff→activate flow with history/identity assertions; unresolved start-date gate; signing identity + history append) — pass.
- Verification: 42 lead tests pass, typecheck clean, `next build` passes (routes: ƒ /api/pilot/[id], ƒ /pilot/[id], ƒ /pilot/[id]/revise).

### Active
- (none — approval room complete)

### Blocked
- (none)

## Next Move
1. PDF rework (`src/components/pdf/PersonalizedLeadPdfDocuments.tsx`): rename "Proposed Portals Production Pilot Plan" (cover + document title), exact 21-day terms inline, boundary page from spec `includedItems/excludedItems/standardIntegrationPaths`, security matrix from `securityDecisions`, auditable value calc, "Incomplete — not eligible for signature" marker, order-form mode after scope confirm; keep the two-page constraint.
2. Stripe Checkout wiring: replace the `pay` action's manual recording with a checkout session endpoint (`/api/pilot/[id]/checkout`), success redirect back to room, graceful fallback if keys missing.
3. Attio deal sync extension (pilot stage/state) + `config/attio-lead-operations.json` attributes + `.env.example` (`PILOT_ROOM_SECRET`, Stripe keys).
4. Full verify: lead tests, typecheck, `npm run build`; migrate step (003) if not yet applied.

## Relevant Files
- `app/api/pilot/[id]/route.ts`: PATCH action enum + recompute + token gate.
- `app/pilot/[id]/page.tsx`: token-gated room page.
- `app/pilot/[id]/revise/page.tsx`: revision form (reuses `PilotScopeForm`).
- `src/components/leads/PilotApprovalRoom.tsx`: room UI (criteria editor, security matrix, commercial, share, sign panel, per-state actions).
- `src/components/leads/PilotScopeForm.tsx`: shared staged form (landing + revision).
- `src/components/resources/PaidPilotLandingPage.tsx`: renders `PilotScopeForm`.
- `src/lib/leads/pilot.ts`: classifier/state machine/builders — keep crypto-free.
- `src/lib/leads/pilot-tokens.ts`: HMAC room tokens (`PILOT_ROOM_SECRET`).
- `src/lib/leads/store.ts`: pilot CRUD + `enqueuePilotEmail`; dry-run memory maps.
- `src/lib/leads/email.ts`: variants + share emails; needs `PILOT_ROOM_SECRET` for links.
- `src/lib/leads/room.test.ts` + `pilot.test.ts`: 22 room/classifier tests.
- `migrations/003_pilot_rooms.sql`: pilot table — run via `npm run migrate:leads`.
- `src/components/pdf/PersonalizedLeadPdfDocuments.tsx`: PDF rework target.
- `src/lib/leads/crm.ts` + `config/attio-lead-operations.json` + `.env.example`: Attio mirror + env updates.

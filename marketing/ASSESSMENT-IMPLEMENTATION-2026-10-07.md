# Assessment v4 implementation — October 7, 2026

Implemented the production-state diagnostic end-to-end in the existing Portals lead/pilot architecture.

## User-visible changes

The assessment progressively asks about one live/imminent production, early pilot readiness, transferability, captured/required state, manual context, failures, economic impact, active patterns, and ownership. It skips redundant handoff, irrelevant provenance/agent branches, and research-only economic/buying questions. Financial disclosure is optional. Back navigation, saved drafts, error focus, labels/legends, responsive grids, and attribution remain available.

Results lead with concrete reasons and an answer-derived intervention. High/Mid enter the existing pilot application with optional assistance; Low receives useful materials and reassessment. Critical outbound identity prefill is reviewable; a different email clears another profile's diagnostic context. The pilot carries the workflow, tools, timing, approval path, bottleneck, observed baseline, and editable measurement checklist forward. V4 applicants do not repeat the legacy diagnostic. The room shows the bottleneck/baseline alongside scope, requirements, success criteria, terms, adjustments, and approval. Downloaded v4 evaluations use explanations and baselines rather than historical assumed ROI recovery cases.

## Scoring/routing

Operational fit/pain has a fixed 70-point maximum and commercial readiness a fixed 30-point maximum. Explicit evidence is required for production-state fit; company size does not earn points. Research ≤49, unscaled solo work normally ≤44, and no meaningful state problem ≤39. A documented severe recurring solo-state exception can remain Mid; it cannot become High without imminent scaling. Unknown/untested answers do not manufacture pain.

High requires ≥70 and near-term production, multiple contributors/scaling, meaningful state pain, test readiness, identified ownership/approval, and a specific urgent workflow. Mid includes ≥50 with an operational problem and a readiness gap. High/Mid can apply; Low receives education. Independent overlapping A/B/C booleans and deterministic evidence codes are stored internally and omitted from public result/profile data. Historical assessments retain their original scoring adapter.

## Schema/persistence/CRM

`assessment.v4` is additive. Shared declarations generate validated choices; the API additionally enforces current required/conditional fields. Existing encrypted submission/profile payloads and scores JSON persist the new data, so **no PostgreSQL migration is needed**. Historical fields, submissions, formats, consent, attribution, retention, CRM lifecycle, and outboxes remain supported. Fresh diagnostics replace stale diagnostic branches without erasing historical submissions.

Apollo projection adds canonical answers, component scores, signals/evidence, and baseline. The existing idempotent provisioner successfully created and verified **38 additive custom fields** and one missing configured list. Final re-verification created zero additional fields/lists and verified the required deal stages. No package manifest/lockfile changes or new dependencies were introduced.

## Analytics

Existing consent-gated tracking now covers assessment view/start/stage/branch, verified submission and High/Mid/Low result, pilot application start/submission, room entry, terms view, successful adjustment/approval, and optional assisted-review intent. Legacy events remain compatible. Server submission events contain structured scores, internal booleans, status, contributors, structured workflow, campaign attribution, completion seconds, and assessment version. Tests ensure qualitative incident/workflow text is excluded and rejected consent results in no analytics request. Room browser events describe successful UI actions; persisted room history remains commercial authority.

## Tests and documentation

**270 lead tests pass**, including 24 new tests. Coverage includes High A, mature VFX B, throughput C, future-ready Mid, solo research, large-company false positives, state-complete workflows, caps/gates, branch/conditional validation, legacy parsing, current API routing/persistence, draft restoration, keyboard/error focus semantics, safe identity prefill, pilot prepopulation/no-repeat behavior, public explainability, CRM projection, consent/event privacy, and v4 PDF rendering.

Updated the normal field/scoring/routing/pilot/analytics specification in `marketing/ASSESSMENT.md`, qualification and outbound campaign docs, pilot/onboarding/PDF notes, root README, frontend/marketing/lead-library guidance, and new lead-component guidance. Product behavior lives in source and normal documentation, not only in AGENTS.md.

## Validation commands and results

All commands below run from the repository root unless stated otherwise:

| Command | Final result |
| --- | --- |
| `npm --workspace frontend run test:leads` | PASS — 270/270 |
| `npm --workspace frontend run typecheck` | PASS |
| `npm --workspace frontend run check:marketing` | PASS — clean |
| `npm --workspace frontend run build` | PASS — production compilation, TypeScript, and 53 static pages |
| `npm --workspace frontend run provision:apollo` | PASS — created/verified additive fields; final rerun 0 creations |
| `git diff --check -- README.md frontend marketing` | PASS |

Additional targeted form validation ran from `frontend` using `node --import ./scripts/test-leads-setup.mjs --import tsx --test src/lib/leads/assessment-form.test.ts`; the same test is included in the green full suite. Formatting validation passed with:

```sh
node node_modules/prettier/bin-prettier.js --check --single-quote --no-semi --trailing-comma all --bracket-spacing false frontend/src/components/leads/AssessmentForm.tsx frontend/src/lib/leads/assessment-definition.ts frontend/src/lib/leads/assessment-diagnostic.ts frontend/src/lib/leads/assessment-fixtures.ts frontend/src/lib/leads/assessment-diagnostic.test.ts frontend/src/lib/leads/assessment-form.test.ts frontend/src/lib/leads/analytics-server.test.ts
```

The frontend has no dedicated lint script; its marketing checker, typecheck, formatting, and whitespace validation were run. Intermediate compatibility/test-harness failures were repaired before the final green suite.

The first build exposed a pre-existing missing Darwin ARM64 Next compiler. The exact repository-pinned `@next/swc-darwin-arm64@16.2.12` package was fetched with `npm pack @next/swc-darwin-arm64@16.2.12 --pack-destination /tmp`, and its missing native file restored in ignored node_modules; no dependency versions were changed. A restricted-network build then compiled but could not read published Sanity content. The final normal build command passed with authorized network access. Apollo provisioning likewise used authorized network access. Existing npm/Node engine warnings and the unrelated resource-page dynamic-cookie fallback log did not prevent the final build.

## Unresolved issues

None blocking this implementation. No deployment, merge, new pilot approval, or outbound communication was performed. Pre-existing infrastructure/security changes and the pre-existing `frontend/next-env.d.ts` change were preserved.

## Files changed

- `README.md`
- `frontend/AGENTS.md`
- `frontend/app/(marketing)/AGENTS.md`
- `frontend/app/(marketing)/workflow/assessment/opengraph-image/route.tsx`
- `frontend/app/(marketing)/workflow/assessment/page.tsx`
- `frontend/app/api/leads/route.ts`
- `frontend/config/apollo-lead-operations.json`
- `frontend/src/components/leads/AGENTS.md`
- `frontend/src/components/leads/AssessmentForm.tsx`
- `frontend/src/components/leads/PilotApprovalRoom.tsx`
- `frontend/src/components/leads/PilotScopeForm.tsx`
- `frontend/src/components/leads/ProgressiveAssessmentFields.tsx`
- `frontend/src/components/pdf/PersonalizedLeadPdfDocuments.tsx`
- `frontend/src/lib/faqs.ts`
- `frontend/src/lib/leads/AGENTS.md`
- `frontend/src/lib/leads/analytics-server.test.ts`
- `frontend/src/lib/leads/analytics-server.ts`
- `frontend/src/lib/leads/assessment-definition.ts`
- `frontend/src/lib/leads/assessment-diagnostic.test.ts`
- `frontend/src/lib/leads/assessment-diagnostic.ts`
- `frontend/src/lib/leads/assessment-fixtures.ts`
- `frontend/src/lib/leads/assessment-form.test.ts`
- `frontend/src/lib/leads/contracts.ts`
- `frontend/src/lib/leads/crm.ts`
- `frontend/src/lib/leads/documents.test.ts`
- `frontend/src/lib/leads/profile.ts`
- `frontend/src/lib/leads/route.test.ts`
- `frontend/src/lib/leads/scoring.ts`
- `marketing/ASSESSMENT-IMPLEMENTATION-2026-10-07.md`
- `marketing/ASSESSMENT.md`
- `marketing/ONBOARDING.md`
- `marketing/PDF.md`
- `marketing/PILOT.md`
- `marketing/QUALIFY.md`
- `marketing/REPLY.md`

# Lead form components

Read `../../../DESIGN.md` and `../../lib/leads/AGENTS.md` before editing this folder.

`AssessmentForm` renders v4 definitions from `assessment-definition.ts`; do not duplicate options or implement UI scoring. Keep inactive controls mounted, preserve drafts/branches, validate before advancing, and focus errors/updated headings accessibly. Skip stages without applicable questions. Critical prefilled identity remains reviewable.

Use the public result supplied by the API/profile; never display internal segmentation, scores, or evidence codes. High/Mid go to the existing pilot application; Low gets use cases/product material and reassessment. Preserve optional assistance, consent, attribution, encrypted persistence, and CRM outboxes. Do not require a new call.

`PilotScopeForm` carries assessment context into the existing five-stage application. `ProgressiveAssessmentFields` must skip historical diagnostic questions for v4 applicants and show their carried baseline instead; preserve direct/legacy application behavior. Baselines and suggested criteria remain reviewable; never imply guaranteed savings. `PilotApprovalRoom` shows bottleneck/baseline alongside scope/terms and tracks successful actions only.

See `../../../../marketing/ASSESSMENT.md` for fields, scoring, routing, analytics, compatibility, and validation. Run frontend typecheck, lead tests, marketing check, and build for funnel changes.

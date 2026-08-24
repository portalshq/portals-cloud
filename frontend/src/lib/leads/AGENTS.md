# Lead qualification and CRM integration

## Progressive qualification

The workflow assessment is the single prospect-facing qualification flow. It asks about a real creative-production workflow, the pain it creates, the desired outcome, and only the practical context needed to recommend a next step. Do not reintroduce a separate “pilot readiness” form after the assessment result.

`assessment` submissions are merged with the lead profile’s previous qualification answers in `frontend/app/api/leads/route.ts`. `frontend/src/lib/leads/scoring.ts` scores fit, production-memory pain, and intent from that merged record. A credible workflow with sufficient fit and pain can move directly to `pilot_scope` when the assessment also establishes timing, ownership, approval path, and the prospect’s stated question or friction. Otherwise, return the most relevant workflow/use-case recommendation. The legacy `commercial_readiness` submission type remains parseable only to preserve earlier submissions; do not use it for new UI.

Keep the form value-led: describe the concrete output first—less rediscovery, fewer recreated assets, faster repeatable production, and lower cost. Questions about approval or a pilot must make clear that they do not commit the prospect to either.

## Adding or changing form fields

Form fields belong to one or more of these categories:

- `general`: identity, attribution, discovery, and context that can apply across lead flows.
- `assessment`: inputs that measure workflow fit, repeatability, or production-memory risk.
- `pilot`: context used to decide whether a customized pilot plan is practical.
- `system`: internal lifecycle, consent, score, and synchronization metadata; never expose these as ordinary prospect questions.

For any field that is captured from a prospect, update every applicable layer:

1. Add or adjust the UI in `frontend/src/components/leads` with a clear, outcome-oriented label and useful placeholder.
2. Validate it in `frontend/src/lib/leads/contracts.ts`; include it in the appropriate submission schema.
3. If it changes qualification, add a scored signal or readiness rule in `frontend/src/lib/leads/scoring.ts`, and merge/route it in `frontend/app/api/leads/route.ts`.
4. Define its Apollo custom-field entry in `frontend/config/apollo-lead-operations.json` with `key`, `label`, Apollo `type`, `modalities`, and `categories`. Keep the field label stable after it is provisioned; changing it creates a separate Apollo field.
5. Map the answer in `contactFields` in `frontend/src/lib/leads/crm.ts`. The CRM is a projection of Portals data, never the source of truth.
6. Update tests for validation, score/routing, and CRM mapping when the new field affects them.

`tools_used` is the reference field: it is a single text input for a comma-separated list of relevant tools, is stored in Apollo as the `Tools used` contact custom field, and is categorized as both `general` and `pilot`. The scoring layer accepts both this text list and historical count-shaped values so old submissions remain valid.

## Apollo provisioning is mandatory

`frontend/scripts/provision-apollo.ts` provisions and verifies the lists and custom fields described by `frontend/config/apollo-lead-operations.json`. Apollo’s public endpoint only accepts scalar field types, so category metadata is maintained in the config for Portals’ form architecture and documented flow; it is not sent as a remote Apollo field group.

When a change adds, renames, changes the modality/type of, or otherwise requires an Apollo custom field, agents must automatically run provisioning as part of the implementation—do not leave this as a manual follow-up:

```sh
npm --workspace frontend run provision:apollo
```

Run it only after the config and provisioner changes are complete, with `APOLLO_API_KEY` available through `frontend/.env.local`. The script is idempotent and verifies the final remote schema. If credentials or network authorization are genuinely unavailable, report that precise blocker in the handoff; never claim the field was provisioned.

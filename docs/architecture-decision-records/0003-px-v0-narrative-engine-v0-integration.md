# ADR 0003: Non-breaking integration of NAP v0 and Narrative Engine v0

## Status
Accepted

## Context
NAP v0 and the Narrative Engine v0 (alpha) are already in production,
embedded in studio-app and 25thChapter. This repo's job is to make them
consumable by third-party channel developers too, without destabilizing
the two products already depending on them.

## Decision
- `@nap/resolver` and `@nap/capability-narrative-engine-adapter` are
  **adapters, not reimplementations**. They wrap the existing v0 clients
  and conform to those clients' current API surface — the adapter bends
  to fit the proven v0 code, not the reverse.
- Extraction of the v0 clients out of studio-app's codebase into their own
  publishable packages (`@nap/protocol-v0`, `@nap/narrative-engine-v0`) is
  a **separate, explicit migration step**, tracked but not done as part of
  this scaffold — both adapter packages currently contain `TODO`-marked
  placeholder imports for exactly this reason.
- No changes to studio-app or 25thChapter are required for this repo to
  exist. They keep using NAP v0 / the narrative engine directly until the
  extraction happens; this repo's adapters are additive.

## Consequences
- Third-party channel developers get a stable contract-compliant interface
  immediately for everything *except* NAP/narrative-engine calls, which
  remain blocked on the extraction step.
- Whoever owns NAP/narrative-engine should treat extracting them into
  standalone packages as the next concrete unblocking task — it's the one
  piece of this repo that can't be filled in independently of that work.
- Risk: if the v0 APIs change shape during extraction, only the two
  adapter packages need updating, not every capability or channel that
  consumes them — that isolation is the entire point of this ADR.

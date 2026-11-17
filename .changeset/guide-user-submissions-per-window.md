---
"@portalshq/capability-interaction-orchestrator": minor
---

Add `user-submissions-per-window` guide config and `userSubmissionsPerWindow` window flag: a window carrying the cap counts an actor's pending *and* fulfilled submissions toward it, so a claimed-and-consumed guide still occupies the slot and per-window submission limits (e.g. one guide per viewer per window) hold — extending the mechanism `feedbackEvent` windows already use.

---
"@portalshq/capability-interaction-orchestrator": minor
---

Add `once-per-user` guide config and `oncePerUser` window flag: a window marked `oncePerUser` counts `fulfilled` submissions toward its per-actor admission cap, so once-per-window quotas (one guide per viewer per window) hold after the first prompt is claimed and consumed — the same mechanism `feedbackEvent` windows already use.

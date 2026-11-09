---
"@portalshq/capability-interaction-orchestrator": minor
---

Simplify interaction config naming and guide API: registry keys are now `option-count`, `window-seconds`, `interval-seconds`, and `model-interval` (replacing `choice-number`, `choice-duration`, `choice-interval-seconds`, `model-choice-interval`, `guide-interval-seconds`, `model-guide-interval`); `ChoiceSettings`/`GuideSettings` fields renamed accordingly (`optionCount`, `windowSeconds`, shared `InteractionSchedule.intervalSeconds`); `GuideQueue` renamed to `GuideCoordinator` (`guide-coordinator.ts`). README rewritten to match the shipped implementation.

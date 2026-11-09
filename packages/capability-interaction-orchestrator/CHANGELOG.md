# @portalshq/capability-interaction-orchestrator

## 0.6.0

### Minor Changes

- 47ec6ee: Simplify interaction config naming and guide API: registry keys are now `option-count`, `window-seconds`, `interval-seconds`, and `model-interval` (replacing `choice-number`, `choice-duration`, `choice-interval-seconds`, `model-choice-interval`, `guide-interval-seconds`, `model-guide-interval`); `ChoiceSettings`/`GuideSettings` fields renamed accordingly (`optionCount`, `windowSeconds`, shared `InteractionSchedule.intervalSeconds`); `GuideQueue` renamed to `GuideCoordinator` (`guide-coordinator.ts`). README rewritten to match the shipped implementation.

## 0.5.1

### Patch Changes

- 7d2b24d: Add `InteractionRepository.reassignSubmissionsActor(worldId, fromActorId, toActorId)` — re-attributes a guest actor's submissions to their verified user id, scoped through `input_windows.world_id`, for guest-trial upgrades.

## 0.5.0

### Minor Changes

- Add polymorphic interaction settings and scheduled guide windows.
  `interactions.choice`/`guides`/`feedback` accept a single object or an array
  of event definitions (feedback remains single-config and warns on extras).
  `interactions.guides` gains GuideSettings: price, window-seconds,
  always-open, guide-interval-seconds / model-guide-interval scheduling,
  max-pending, and prompt-max-length.

  GuideQueue gains `openWindow` for bounded guide windows that emit
  `guide_opened` with a narrative theme, a `submit` facade routing to the
  standing always-open queue or the open scheduled window, `expireClosed`
  publishing windows whose intake deadline passed (new `open → published`
  transition, skipped by the generic window closer), a session-scoped
  `claimNextForSession` FIFO across all guide windows, and `queueStatus`
  filtered by session. Admitted guides stay eligible after publish;
  charge-at-claim semantics are unchanged.

## 0.3.0

### Minor Changes

- 31b4bb6: Replace interaction orchestration stubs with a transactional PostgreSQL lifecycle,
  seven arbitration policies, rating-based input/output moderation, credit holds and
  refunds, durable event replay, and idempotent execution dispatch. Apply the additive
  002 migration after the core and monetization schemas. Monetization now acquires
  grant locks in the same order as interaction billing while preserving oldest-first
  consumption.

### Patch Changes

- Updated dependencies [31b4bb6]
  - @portalshq/monetization@0.2.2

## 0.2.0

### Minor Changes

- 6dcac72: Replace interaction orchestration stubs with a transactional PostgreSQL lifecycle,
  seven arbitration policies, rating-based input/output moderation, credit holds and
  refunds, durable event replay, and idempotent execution dispatch. Apply the additive
  002 migration after the core and monetization schemas. Monetization now acquires
  grant locks in the same order as interaction billing while preserving oldest-first
  consumption.

### Patch Changes

- Updated dependencies [6dcac72]
  - @portalshq/monetization@0.2.1

---
"@portalshq/capability-interaction-orchestrator": patch
---

Add `InteractionRepository.reassignSubmissionsActor(worldId, fromActorId, toActorId)` — re-attributes a guest actor's submissions to their verified user id, scoped through `input_windows.world_id`, for guest-trial upgrades.

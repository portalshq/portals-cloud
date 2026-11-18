# @portalshq/channel-registry

## Unreleased

- Add `updateProgramDetails(query, programId, patch)` for partial updates of a program's public `name`, `description`, and `tagline`.
- Add `sql/003_channel_admin.sql`: central `channel_admin_tokens` (scoped Channels admin tokens) and `channel_app_control_tokens` (per-channel app production-control credentials).

## 0.2.3

### Patch Changes

- Republish of 0.2.2: the npm staged publish never became visible on the registry.

## 0.2.2

### Patch Changes

- f75dca8: Add optional `channels.<id>.guest."initial-credits"` schema field so apps can configure the starting credit balance granted to guest actors.

## 0.2.1

### Patch Changes

- Accept the optional channel `signup.bonus-credits` block so registries carrying a welcome-bonus policy still validate and survive `openChannelRegistry` refreshes.

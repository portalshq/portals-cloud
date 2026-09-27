# @portalshq/capability-identity

**Reusable agent module:** [integration guide](../../../docs/package-agents/identity.md)

Target type surface for a persistent audience identity and channel-interaction history.

## Exported shape

- `AudienceIdentity`: `userId` and `displayName`.
- `ChannelHistoryEntry`: channel, session, and ISO interaction timestamp.
- `IdentityProvider`: `getIdentity()`, `recordInteraction()`, and `getHistory()`.

## Status: stub

Every `IdentityProvider` method always throws. It provides no authentication, authorization, storage, privacy controls, or history implementation. Use the interfaces to define an application-owned provider only; do not instantiate it in production.

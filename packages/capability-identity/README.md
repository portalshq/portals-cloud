# @portalshq/capability-identity

**Reusable agent module:** [integration guide](../../../docs/package-agents/identity.md)

Verified application identity and persistent cross-channel interaction history.

## Exported shape

- `AudienceIdentity`: `userId` and `displayName`.
- `ChannelInteraction`: soft `channelId` and `sessionId` cross-database keys.
- `ChannelHistoryEntry`: a `ChannelInteraction` plus the stored interaction time.
- `IdentityProvider`: `getIdentity()`, `recordInteraction()`, `getHistory()` — each verifies an access token first.
- `IdentityStore`: persistence contract, so applications can substitute their own storage.
- `PostgresIdentityStore`: adapter for Portals `application_users` and `application_user_channel_history`.
- `QueryRunner`: the minimal `pg.Pool` surface the adapter needs.

## Setup

Portals operators apply `frontend/migrations/015_application_user_channel_history.sql`; creator
applications do not own or run this migration. Construct the provider with a token verifier that
validates the credential server-side and returns an active `application_users.id`, plus a
`PostgresIdentityStore`. Never let a browser-supplied user ID be the verifier's result.

## Limits

- Interaction time is the storage transaction clock, so a caller cannot backdate or forward-date history.
- `channelId` and `sessionId` are 1–128 characters, enforced in code and by the table.
- `getHistory` reads at most `DEFAULT_HISTORY_ENTRIES` (100) rows and clamps any request to `MAX_HISTORY_ENTRIES` (500).

## Tests

`npm test` runs the provider and store unit tests. The PostgreSQL integration suite runs only when
`IDENTITY_TEST_DATABASE_URL` points at a scratch database, because it creates and drops its own tables.

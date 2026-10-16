# @portalshq/capability-identity

**Reusable agent module:** [integration guide](../../../docs/package-agents/identity.md)

Verified application identity and persistent cross-channel interaction history.

## Exported shape

- `AudienceIdentity`: `userId`, `displayName`, optional `email`, and optional `preferences`.
- `ChannelInteraction`: soft `channelId` and `sessionId` cross-database keys.
- `ChannelHistoryEntry`: a `ChannelInteraction` plus the stored interaction time and optional `metadata`.
- `IdentityProvider`: `getIdentity()`, `recordInteraction()`, `getHistory()`, `syncFromAuthGateway()`, `validateSoftKey()` — each verifies an access token first.
- `IdentityStore`: persistence contract, so applications can substitute their own storage.
- `ApplicationIdentityStore` (formerly `PostgresIdentityStore`): adapter for Portals `application_users` and `application_user_channel_history` in the application database.
- `CentralIdentityStore`: adapter for central Portals `users` and `user_channel_history` in the central database for cross-app identity.
- `AuthGatewayClient`: gRPC client for communicating with the auth-gateway service.
- `createAuthGatewayClient()`: Factory function to create an auth-gateway gRPC client instance.
- `QueryRunner`: the minimal `pg.Pool` surface the adapters need.

## Setup

### Application Identity Store

For app-specific identity data, use `ApplicationIdentityStore`:

```typescript
import { IdentityProvider, ApplicationIdentityStore } from "@portalshq/capability-identity";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const store = new ApplicationIdentityStore(pool);
const provider = new IdentityProvider(verifyAccessToken, store);
```

Portals operators apply `frontend/migrations/015_application_user_channel_history.sql`; creator
applications do not own or run this migration. Construct the provider with a token verifier that
validates the credential server-side and returns an active `application_users.id`, plus a
`ApplicationIdentityStore`. Never let a browser-supplied user ID be the verifier's result.

### Central Identity Store

For cross-app identity data, use `CentralIdentityStore`:

```typescript
import { IdentityProvider, CentralIdentityStore } from "@portalshq/capability-identity";
import pg from "pg";

const centralPool = new pg.Pool({ connectionString: process.env.CENTRAL_DATABASE_URL });
const store = new CentralIdentityStore(centralPool);
const provider = new IdentityProvider(verifyAccessToken, store);
```

The central database schema is defined in `src/central-schema.sql` and must be applied to the central database.

### Auth-Gateway Integration

To sync user data from auth-gateway:

```typescript
import { createAuthGatewayClient } from "@portalshq/capability-identity";

const authGatewayClient = createAuthGatewayClient({
  address: process.env.AUTH_GATEWAY_ADDRESS || "localhost:50051",
  useTls: process.env.AUTH_GATEWAY_TLS === "true",
});

// Sync user data from auth-gateway
await provider.syncFromAuthGateway(userId, authGatewayClient, resourceId);

// Validate soft key references to central database
const isValid = await provider.validateSoftKey("users", userId, centralPool);
```

**Important:** Auth-gateway `UserInfo` only contains `user_id` and `display_name`. Email and preferences are not available from auth-gateway and must be managed by the application itself.

## Limits

- Interaction time is the storage transaction clock, so a caller cannot backdate or forward-date history.
- `channelId` and `sessionId` are 1–128 characters, enforced in code and by the table.
- `getHistory` reads at most `DEFAULT_HISTORY_ENTRIES` (100) rows and clamps any request to `MAX_HISTORY_ENTRIES` (500).
- `validateSoftKey` only validates against specific allowlisted tables: `users`, `channel_apps`, `channel_schedules`.
- Auth-gateway UserInfo does not include email or preferences; these must be managed by the application.

## Tests

`npm test` runs the provider and store unit tests. The PostgreSQL integration suite runs only when
`IDENTITY_TEST_DATABASE_URL` points at a scratch database, because it creates and drops its own tables.

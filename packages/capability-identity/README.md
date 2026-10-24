# @portalshq/capability-identity

Server-side verified identity and cross-channel history. Requires Node.js 22 and PostgreSQL 14+.

`IdentityProvider` verifies credentials before identity/history operations. Both PostgreSQL
adapters require an active local account for those operations. Profile sync and soft-key
validation are explicit trusted-server operations: they do **not** verify access tokens or
establish authorization. Never expose sync with an arbitrary browser-supplied user ID.

## Setup and deployment

Install this package and `pg` in a server application. Choose one adapter:

| Adapter | Ownership | Profile sync |
| --- | --- | --- |
| `ApplicationIdentityStore` | Existing application-owned accounts | Updates existing profiles; refuses missing accounts |
| `CentralIdentityStore` | Dedicated shared identity database | Creates missing profiles; updates existing profiles |
| Custom `IdentityStore` | Application-defined persistence | Optional `SyncableIdentityStore` capability |

Auth-gateway supplies only `userId` and `displayName`. Sync never changes an existing
account's status, email, encrypted identity, preferences, or issuer. Application account
creation must go through the application's provisioning flow: its schema requires
`email_hash` and `identity_ciphertext`, which auth-gateway does not provide.

Configure `AUTH_GATEWAY_ADDRESS` (`host:port`), `AUTH_GATEWAY_RESOURCE_ID`,
`AUTH_GATEWAY_TLS=true` for TLS, and `CENTRAL_DATABASE_URL` or `DATABASE_URL`.
Environment variables are read by the application, not implicitly by this package.
Use database TLS and least-privilege runtime credentials; run migrations separately with
DDL credentials. Stop accepting requests before closing the gRPC client and database pool.

```typescript
import pg from "pg";
import {
  CentralIdentityStore, IdentityProvider, createAuthGatewayClient,
} from "@portalshq/capability-identity";

const pool = new pg.Pool({ connectionString: process.env.CENTRAL_DATABASE_URL });
const gateway = createAuthGatewayClient({
  address: process.env.AUTH_GATEWAY_ADDRESS!,
  useTls: process.env.AUTH_GATEWAY_TLS === "true",
  timeout: 5000,
});
const provider = new IdentityProvider(
  async (token) => (await gateway.verifyUser(token)).userId,
  new CentralIdentityStore(pool),
);
// token comes from the authenticated request; provisioning/sync is a separate trusted flow.
// const identity = await provider.getIdentity(token);
// await provider.recordInteraction(token, { channelId: "channel-1", sessionId: "session-1" });
// const history = await provider.getHistory(token, 25);
```

See the [integration guide](docs/integration-guide.md) for provisioning, profile sync,
custom-store migration, and a complete runnable example. The guide also records the
two-database deployment model (central identity/entitlement schema versus the
application's own schema — the migration sets never run on the same database), the
request-path store tradeoff around central account suspension, and the agreed
audience `user_type` cohort tag and session-RPC sign-in specifications.

## Database migration

### Central database

Run only on a dedicated central identity database, before deploying application code:

```typescript
import pg from "pg";
import { runCentralMigrations } from "@portalshq/capability-identity";
const pool = new pg.Pool({ connectionString: process.env.CENTRAL_DATABASE_URL });
try { await runCentralMigrations(pool); } finally { await pool.end(); }
```

The versioned `sql/001_central_identity.sql` ships in the npm package. The runner applies
it atomically with a transaction-scoped advisory lock and can be rerun or called concurrently.
It creates `users`, `user_preferences` (JSONB values by key), `channel_apps`,
`channel_schedules`, `channel_sessions`, and `user_channel_history` with history indexes.
It does not open or close the supplied pool. PostgreSQL errors propagate to the caller.
Manual alternative: execute that SQL in a transaction with `psql -v ON_ERROR_STOP=1 --single-transaction`.

The migration also upgrades the previously distributed central schema: adds active/suspended
status, allows missing issuer information and optional legacy `app_id` on history, and adds
the conflict key used by the store. Channel and session IDs must be globally scoped across
applications; history is unique on `(user_id, channel_id, session_id)`. Legacy `app_id`
values and metadata are retained. The store does not populate the channel registries.

Back up before upgrading. Existing duplicate soft keys, null sessions, or blank/oversized
identifiers cause migration failure and full rollback. Reconcile these records explicitly
according to your application's identity rules, then rerun. The migration never deletes
history to resolve ambiguity. There is no destructive automatic down migration.

### Application database

Portals operators provision application accounts and apply
`frontend/migrations/015_application_user_channel_history.sql` in the platform repository.
Creator applications do not run platform migrations. `PostgresIdentityStore` remains an
alias of `ApplicationIdentityStore`. Application sync requires the schema's `updated_at`
column and never synthesizes the private identity fields required for account creation.

## Public interface

```typescript
interface AudienceIdentity {
  userId: string;
  displayName: string;
  email?: string;
  preferences?: Record<string, unknown>;
}
interface ChannelInteraction { channelId: string; sessionId: string }
interface ChannelHistoryEntry extends ChannelInteraction {
  lastInteractionAt: string;
  metadata?: Record<string, unknown>;
}
interface IdentityStore {
  getIdentity(userId: string): Promise<AudienceIdentity | undefined>;
  recordInteraction(userId: string, interaction: ChannelInteraction): Promise<void>;
  getHistory(userId: string, limit: number): Promise<readonly ChannelHistoryEntry[]>;
}
interface SyncableIdentityStore extends IdentityStore {
  syncFromAuthGateway(userId: string, displayName: string): Promise<void>;
}
```

- `new IdentityProvider(verifyAccessToken, store)`: verifier is `(token: string) => Promise<string>`;
  it must validate credentials server-side and return the verified subject ID.
- `provider.getIdentity(accessToken): Promise<AudienceIdentity>`: rejects unknown/suspended accounts.
- `provider.recordInteraction(accessToken, interaction): Promise<void>`: validates soft IDs,
  then verifies the account and writes using the database clock.
- `provider.getHistory(accessToken, limit = 100): Promise<readonly ChannelHistoryEntry[]>`:
  requires a positive integer and clamps to 500. Results are newest first.
- `provider.syncFromAuthGateway(userId, gateway, resourceId): Promise<void>`: requires a
  `getUserInfo` client and a sync-capable store, rejects mismatched subjects and propagates
  upstream/storage errors. IDs must be nonblank and at most 128 trimmed characters.
- `provider.validateSoftKey(table, key, centralPool): Promise<boolean>`: parameterized lookup
  for `users`, `channel_apps`, or `channel_schedules` only. Invalid table names throw;
  missing rows/database errors return false. Existence does not imply an active account.
- `new ApplicationIdentityStore(pool)` / `new CentralIdentityStore(pool)`: implement the
  sync-capable interface. Callers using adapters directly must validate IDs and history limits;
  `IdentityProvider` supplies that validation. Neither adapter owns the pool lifecycle.
- `centralStore.updateUserInfo(userId, displayName): Promise<void>`: legacy update-only
  method, silently leaves a missing user untouched. Prefer explicit sync for provisioning.
- `runCentralMigrations(pool): Promise<void>`: central provisioning described above.
- `QueryRunner`: `query(text: string, values?: unknown[])` returning a promise of
  `{ rowCount: number | null; rows: Record<string, unknown>[] }`; compatible with `pg.Pool`.
- `createAuthGatewayClient({ address, useTls?, timeout?, protoPath? }): AuthGatewayClient`:
  requires a nonblank address; timeout is a finite positive per-call deadline, default 5000ms.
  Uses the bundled proto unless overridden. Default transport is insecure for private/local
  use; enable TLS for deployment. Proto load errors are synchronous.
- Client methods: `verifyUser(token)`, `getUserInfo(resourceId, userId)`, and
  `getUserId(resourceId, displayName)` return `Promise<UserInfo>`; `UserInfo` contains
  `userId` and `displayName`. Malformed/missing identities reject; gRPC errors retain their
  `code` and `details`. `close(): void` is idempotent; later calls reject.
- Constants: `MAX_IDENTIFIER_LENGTH=128`, `DEFAULT_HISTORY_ENTRIES=100`,
  `MAX_HISTORY_ENTRIES=500`, and `INACTIVE_ACCOUNT_ERROR`.

Interactions upsert without moving timestamps backwards. Account eligibility and writes
are checked in one statement. Concurrent changes follow PostgreSQL statement snapshot
semantics; credential revocation and suspension are not a distributed transaction.
The PostgreSQL adapters return only channel ID, session ID, and timestamp in history;
optional metadata is reserved for custom adapters. Central preferences come from
`user_preferences`; application preferences/email remain application-owned.

## Testing and packaging

From the repository root:

```sh
npm run build --workspace=@portalshq/capability-identity
npm run typecheck --workspace=@portalshq/capability-identity
npm test --workspace=@portalshq/capability-identity
npm run test:coverage --workspace=@portalshq/capability-identity
```

Coverage enforces at least 95% statements, branches, functions, and lines for all published
TypeScript source. Build tooling is validated separately by building and inspecting the pack.
The real local gRPC transport suite needs permission to bind localhost. Build copies the
repository's canonical proto to `src/proto` and `dist/proto`; the latter ships with the package.
Clean checkouts without the lore submodule build from the checked-in protocol snapshot.
The source snapshot also lets tests run before building. Updating the canonical proto
requires a build and committing the refreshed source copy. Installed consumers need neither
the repository nor the canonical proto path.

Database suites use explicit non-production connection variables:
`IDENTITY_TEST_DATABASE_URL` and `IDENTITY_CENTRAL_TEST_DATABASE_URL`.
The application suite drops/recreates its named tables and **must use a disposable database**.
The central suite uses randomly named schemas and removes only those schemas.
Without URLs, database suites skip. The deployed gateway suite additionally requires
`AUTH_GATEWAY_ADDRESS`, `AUTH_GATEWAY_RESOURCE_ID`, and
`IDENTITY_AUTH_GATEWAY_TEST_TOKEN`; supply a dedicated test identity and TLS setting.
It verifies the token, both lookups, and invalid-credential rejection without writing profiles.

## Troubleshooting

| Symptom | Resolution |
| --- | --- |
| Inactive account error | Verify subject-to-local-account mapping and local status; sync does not reactivate accounts. |
| Application account must be provisioned | Run the application's account-creation flow before syncing its profile. |
| Store does not support sync | Implement `SyncableIdentityStore`, or omit explicit sync for a custom cache. |
| Central missing columns/conflict constraint | Apply the packaged central migration using DDL credentials before deploying. |
| Migration fails on duplicate/null/invalid history | Back up and reconcile legacy records; failures roll back, preserving evidence. |
| Proto not found | Rebuild from the repository or reinstall the published package; check custom `protoPath`. |
| `UNAVAILABLE` / `DEADLINE_EXCEEDED` | Check address, reachability, TLS, and per-call timeout. Retry only under your caller's policy. |
| `UNAUTHENTICATED` | Refresh/reject the credential; never fall back to a browser-supplied user ID. |
| Soft-key lookup returns false | Check registry data and connectivity; database failures deliberately fail closed. |

## Release validation

Version 0.2.1 adds profile synchronization, packaged proto assets, central schema provisioning,
and the tests and guides above. Local PostgreSQL and gRPC transport tests are separate from
deployed auth-gateway acceptance. See `CHANGELOG.md` for the release record.

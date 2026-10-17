# Identity integration guide

## Choose the owning database

Use the central adapter when this application owns shared identity provisioning. Use the
application adapter when Portals has already created an application account. A custom
`IdentityStore` is appropriate for consumers that only cache sightings and delegate history
to the platform. Keep token verification on the server in every case.

The storage seam has two concrete adapters; both expose the same profile-sync capability.
The provider handles upstream subject matching once, so callers do not implement store-specific
fallbacks. Unsupported custom stores fail explicitly instead of silently ignoring sync.

## Central setup: runnable server-side example

Install `pg` and this package. Configure the central database URL, auth-gateway address,
resource ID, and TLS. Run central provisioning with DDL credentials before serving traffic.
This example accepts a **server-obtained test token** and explicitly provisions its verified
subject. It is an onboarding operation, not middleware to run on every request.

```typescript
import pg from "pg";
import {
  CentralIdentityStore, IdentityProvider, createAuthGatewayClient, runCentralMigrations,
} from "@portalshq/capability-identity";

const pool = new pg.Pool({ connectionString: process.env.CENTRAL_DATABASE_URL });
const gateway = createAuthGatewayClient({
  address: process.env.AUTH_GATEWAY_ADDRESS!,
  useTls: process.env.AUTH_GATEWAY_TLS === "true",
  timeout: 5000,
});
try {
  await runCentralMigrations(pool); // deployment setup; use a separate DDL role in production
  const provider = new IdentityProvider(
    async (token) => (await gateway.verifyUser(token)).userId,
    new CentralIdentityStore(pool),
  );
  const token = process.env.IDENTITY_AUTH_GATEWAY_TEST_TOKEN!;
  const verified = await gateway.verifyUser(token);
  await provider.syncFromAuthGateway(verified.userId, gateway, process.env.AUTH_GATEWAY_RESOURCE_ID!);
  const identity = await provider.getIdentity(token);
  await provider.recordInteraction(token, { channelId: "example:channel", sessionId: "example:session" });
  const history = await provider.getHistory(token, 25);
  console.log(identity.displayName, history.length);
} finally {
  gateway.close();
  await pool.end();
}
```

Application setup uses `new ApplicationIdentityStore(pool)` with the same provider.
Provision the account through Portals before calling sync. Never fill required encrypted
identity fields with empty strings or invented data just to make an insert succeed.
Both adapters preserve suspended status during profile updates.

## Verification and request handling

Extract the request credential, validate it through `verifyUser`, and let `IdentityProvider`
check the local active account. Return an authentication/authorization failure when verification
or active-account lookup fails. Treat database and gateway availability errors according to
your request error policy; do not translate outages into successful anonymous identities.
Use gRPC error `code` for classification. The package performs no automatic retries.

Run sync in a trusted onboarding/admin flow with a verified subject or an operator-authorized
subject. `getUserInfo` is a metadata lookup, not proof that the requesting caller owns that ID.
Soft references only establish existence and cannot approve commercial or access transitions.

## Existing central schema upgrade

Back up, stop incompatible writers, and run `runCentralMigrations` on the central database.
The migration is repeatable, serializes concurrent runs, and rolls back all changes on failure.
Existing issuer/email/preferences/history data stays intact. Legacy history with duplicate
`(user_id, channel_id, session_id)` values across apps must be reconciled by the operator.
Null sessions and invalid soft IDs must also be resolved explicitly. Globally namespace channel
and session IDs when different applications previously reused them. Verify the resulting
history before restarting writers. Do not run the central migration on the platform application
database or an unrelated database with a table called `users`.

For SQL-only deployment, run the package's `sql/001_central_identity.sql` using
`psql -v ON_ERROR_STOP=1 --single-transaction`; serialize manual deployments yourself.
The TypeScript runner handles serialization automatically. No migration runs on import.

## Moving from custom stores

First establish whether the custom store owns identities or is merely a cache. For an owning
store, back up and map subject IDs without changing them; provision required account fields
through the owning application's workflow. Import history preserving its original timestamps
in an operator-controlled migration. `recordInteraction` intentionally cannot backdate events.
Switch the provider's adapter only after comparing identities, active status, and history.

For a cache, retain its existing `IdentityStore` implementation. Implement profile sync only
if it has a meaningful persistent effect; an unsupported sync operation should fail explicitly.
Do not replace a consumer cache with an authoritative store just to reuse a class.

### bears-live-app assessment

No bears-live-app migration is included. The described `AudienceViewerStore` pattern—cache
viewers on sight, delegate authoritative verification and history to the platform—is compatible
with the custom-store seam. It serves a different ownership role from either PostgreSQL adapter.
The implementation was not found in this checkout, so its exact behavior is not verified here.
Before changing that application, review its actual token validation and platform-history path.

## Operational checklist

Use TLS to the gateway outside a trusted private network, TLS to the database, a finite call
deadline, and separate migration/runtime database roles. Monitor failed lookups and syncs
without logging credentials. Close the client and pool during graceful shutdown. Back up
before legacy migration; restore from backup if an incompatible release must be rolled back.
No package build, test, or migration runner provisions a remote production database implicitly.

See the [README](../README.md) for the complete interface, environment settings, troubleshooting,
and commands for PostgreSQL, gRPC, and coverage verification.

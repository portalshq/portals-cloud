<!-- doc-module: identity-agent-guide -->
# Identity: agent guide
## Load when
Resolving a verified Portals application user or storing cross-channel interaction history.
## Use
Construct `IdentityProvider` with a server-side `VerifyAccessToken` implementation and `PostgresIdentityStore`. The verifier must validate the credential and return an active `application_users.id`. Portals operators apply `frontend/migrations/015_application_user_channel_history.sql`; creator applications never own or run it. Pass any `pg.Pool` — the store only requires the `QueryRunner` surface.
## Do not assume
Browser-supplied user IDs are credentials. The package deliberately does not duplicate token verification: the verifier is injected, so any OIDC provider or Auth Gateway verification works unchanged. The canonical verifier is `createAuthGatewayClient().verifyUser` over gRPC — there is no HTTP token-verification endpoint on the gateway. It must resolve to the internal `application_users.id`, never a provider subject. Interaction time is the storage transaction clock, so callers cannot backdate or forward-date history, and `channelId`/`sessionId` are soft cross-database references bounded to 128 characters. `getHistory` returns at most 500 rows. Central and application databases are separate targets with separate migration sets — never run `runCentralMigrations` against an application database or app migrations against `CENTRAL_DATABASE_URL`; see the integration guide for the two-database model and the request-path suspension tradeoff.

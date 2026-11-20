# Database efficiency

Channels is designed to remain within Neon Free plan limits: 100 CU-hours and
5 GB of public network transfer per project. It uses Lakebase Postgres,
PgBouncer-compatible pooled URLs, HTTP caching, and process-local request
coalescing. It does not require a paid cache, queue, or monitoring export.

## Chat reads

`GET /api/programs/:programId/chat` and group chat reads accept:

- `limit`: 1-100 messages.
- `after`: the last observed numeric message position.
- `If-None-Match`: the validator from the previous response.

Responses include `ETag` and `X-Chat-Cursor`. Public clients load one bounded
snapshot, request only newer positions, and back off from 2.5 to 30 seconds
while idle. A successful local send wakes the reader immediately. Public reads
are coalesced for two seconds per process and may be served by the CDN; private
group reads remain `private, no-store`. Accepted writes use one atomic SQL
statement for scope checks, idempotency, rate limiting, locking, and insertion.

Set `CHANNELS_REALTIME_CHAT_ENABLED=true`, `NEON_REALTIME_SECRET`,
`NEON_REALTIME_DB`, and `NEXT_PUBLIC_NEON_REALTIME_URL` only for an approved
branch canary. The server seals bounded program queries and group queries that
include active membership; the secret never reaches the browser. One browser
client and one subscription per thread are shared on a page. Capability,
subscription, or transport failure automatically returns the UI to the complete
cursor/ETag path. Realtime is still beta and has no RLS support, so production
activation and allowed-origin changes remain a separate operator gate.

## Stable public data

Catalog and program-scoped reads share in-flight promises and 15-second
process-local snapshots. Public preview responses use a five-second CDN cache,
30-second stale-while-revalidate window, and ETags. The last valid public
program copy remains available if the central database or app origin is
temporarily unavailable. Admin program, schedule, and session mutations clear
the affected process-local catalog snapshots immediately.

## Connections and workers

- Use Neon pooled connection strings for application traffic.
- `CENTRAL_DATABASE_URL` points to the platform database.
- `APP_DATABASE_URL` is optional and points to the Bears application database
  used only for admin checkpoint enrichment.
- Pools are bounded, lazy, and allowed to exit when idle.
- Durable PostgreSQL fanout performs one cursor query per active topic, not one
  query per connected subscriber.
- Identity synchronization updates a central user row only when the display
  name changes.
- Analytics schema setup is single-flight per process rather than repeated for
  each event.

Track chat read calls, returned rows, 304 responses, cache hits, fanout topics,
auth verification calls, worker idle delay, Lakebase active time, and network
transfer during rollout. Do not log credentials, message text, or identity
attributes.

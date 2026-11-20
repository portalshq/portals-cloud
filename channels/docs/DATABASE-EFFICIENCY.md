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
group reads remain `private, no-store`.

Neon Realtime is available on the Free plan during beta, but it is not required
for this path. Connected logical-replication subscribers keep database compute
active. Enable a Realtime transport only after measuring that active audience
traffic justifies its compute and egress; cursor reads remain the recovery and
rollback path.

## Stable public data

Catalog and program-scoped reads share in-flight promises and 15-second
process-local snapshots. Public preview responses use a five-second CDN cache,
30-second stale-while-revalidate window, and ETags. The last valid public
program copy remains available if the central database or app origin is
temporarily unavailable.

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

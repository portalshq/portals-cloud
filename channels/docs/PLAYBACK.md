# Live playback in the browse UI — design note

How a "live" channels listing should resolve a playable stream, and why the
stream address itself does not belong in Postgres. Written for the future
implementation that replaces the hardcoded catalog in
`components/channels/data.ts`.

## The problem

The browse UI's `Channel.stream` is a playable source (HLS manifest via hls.js
today), so a "live" listing row needs something the player can actually attach
to. The question is where that descriptor should live, and the answer depends
on what kind of delivery the channel uses.

## Why you'd want it in the DB

- A browse listing whose tiles can't play is a dead catalog — the stream is
  part of what makes a row "fully functional."
- For channels on stable, always-on HLS endpoints (third-party feeds, fixed
  origins), `stream` is genuinely static catalog data — storing it alongside
  name/description is simple and correct, same shape as the placeholder rows
  today.

## Why *not* store it for bears-style channels

- **Playback is dynamic, not a stored value.** Bears' `/api/channel` returns
  `playback` resolved at request time — a Reactor grant (`kind: 'reactor'` →
  per-viewer session token via `POST /api/reactor/session`) or a queue
  manifest that only exists while the production pipeline is running. There is
  no canonical URL to persist.
- **It goes stale by design.** `OFFAIR_BEHAVIOR=closed` means the manifest
  dies between episodes; a persisted URL would let the browse app confidently
  render a dead player. The truthful answer to "can I watch this now" is the
  app's schedule phase + live delivery state, not a column.
- **Credentials leak.** Bears' `streamUrl` reminder links carry an HMAC guest
  token with a TTL. Baking descriptors like that into durable rows both embeds
  secrets in storage and makes them live past their intended lifetime.

## The model that fits

The catalog stores a *reference*, not a stream — and we already have it: the
`station/program/channel` binding names which app owns playback. The browse
app resolves the live descriptor lazily — a route handler that calls the
owning app's `/api/channel` for the focused tile or channel page (same pattern
as the admin `production/status` proxy), returning `{playback, nextSession}`
and rendering off-air cards when `playback: null`. Channels with genuinely
static HLS can still carry `metadata.stream` in the catalog row as an
override.

**So: identity/name/schedule-state → Postgres; playable descriptor → resolved
live from the channel app, never persisted.**

## Implementation sketch

- Catalog read: app `channels` + `production_checkpoints` (name, live mode)
  joined with central `station_schedule_rules`/`station_program_slots`
  (binding, next session) — the same join `GET /api/admin/channels` does
  today, minus privileged fields.
- Playback resolve: `GET /api/channels/:id/playback` route handler → fetch the
  bound app's `/api/channel` → normalize `{playback, offAir, nextSession}` for
  the tile. Cache briefly (seconds); never persist.
- Player: `playback.kind === 'video'` → hls.js on `url`;
  `kind === 'reactor'` → grant flow via the app's `POST /api/reactor/session`
  (per-viewer, minted lazily); `null` → off-air card with `nextSession`.

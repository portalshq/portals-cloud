# Channels admin

Operator console for channel scheduling, programs, sessions, and production.
Ported from `massively-social-ebook/admin` (ControlRoom) onto the station-grid
schema used by `bears-live-app`. Read `SCHEDULING.md` first for the scheduling
model and `CHANNEL-APPS.md` for the app registry.

The public room key is `programs.slug`, not the tenant ID or a station ID.
Admin scope `channel_id` values are creator tenant IDs. Migration `0013`
requires each new rule or slot to pair a program with its owning creator
channel. When an admin slot write overlaps another scheduled or live slot on
the same station, the database rejects it and the API returns `409`.

The admin manages **any app in the channels registry** — not just bears. A
channel appears in the admin when a program is bound to it (schedule rules or
session slots) or an app is registered for it (central `programs.app_origin`,
with `CHANNELS_APPS`/`BEARS_API_BASE_URL` as env fallbacks).

## Components

| Piece | Path | What it is |
|---|---|---|
| SPA | `admin/` | Standalone Vite + React + Tailwind app (not an npm workspace). Tabs: Sessions, Schedules, Channels, Production. |
| API | `app/api/admin/*` | Next.js route handlers; the SPA's `/api/admin` calls land here. |
| Data layer | `lib/admin/` | Lazy `pg` pools (`db.ts`), scoped bearer auth (`auth.ts` + `scope.ts`), env (`env.ts`), per-app control credentials (`production.ts`), ScheduleConfig validation (`schedule.ts`), DTOs (`types.ts`). |

## Authentication and scoping

Every route requires `Authorization: Bearer <token>`. The token decides the
scope:

- `CHANNELS_ADMIN_TOKEN` (env) — the platform superuser: every channel, every
  operation. Unset → scoped tokens still work through the central database.
- A **scoped token** — a row in the central `channel_admin_tokens` table
  (created by `packages/channel-registry/sql/003_channel_admin.sql`).
  `token_hash` is `sha256(token)` hex (compute it with
  `printf %s "$TOKEN" | shasum -a 256`); `channel_ids` lists the channel
  tenant IDs the token may view and mutate; `revoked_at` soft-revokes.

Scoped tokens only see and edit their channels' programs, schedules, and
sessions; `GET /api/admin/info` reports the scope (the SPA shows it in the
header). A program is editable only when **every** channel it is bound to is
in scope. When neither the env token nor the central database is configured,
all admin routes answer 503.

## Environment variables

Annotated placeholders live in `channels/.env.example` (server) and
`channels/admin/.env.example` (SPA). Copy to `.env.local`; real `.env*` files
stay gitignored.

| Var | Purpose |
|---|---|
| `CHANNELS_ADMIN_TOKEN` | Platform superuser bearer for `/api/admin/*`. Scoped tokens come from the `channel_admin_tokens` table instead. |
| `CENTRAL_DATABASE_URL` | Central platform database — the channel source of truth (`stations`, `programs`, `station_schedule_rules`, `station_program_slots`, `channel_admin_tokens`, `channel_app_control_tokens`). |
| `APP_DATABASE_URL` | Optional Bears application database used for checkpoint enrichment. Keep this separate from `CENTRAL_DATABASE_URL`; use a pooled Neon URL when applicable. |

Both URLs use a bounded pool of two connections per warm Vercel function. Neon
production URLs must use the `-pooler` hostname. A non-Neon production database
is supported when its matching `*_DATABASE_SSL_CA`, `*_DATABASE_SSL_CERT`, and
`*_DATABASE_SSL_KEY` environment variables contain the client mTLS material;
the pool verifies the server certificate and hostname. Use `CENTRAL_...` for
the Channels database and `APP_...` for the optional Bears database. Values may
contain literal newlines or `\\n` escapes.
| `BEARS_API_BASE_URL` | Bears server origin: registers the bears app in the registry and acts as its production origin. |
| `BEARS_PRODUCTION_CONTROL_TOKEN` | Legacy fallback forwarded to bears `POST /api/production/*`. Prefer the `channel_app_control_tokens` table. Never reaches the browser. |

## App production control

`POST /api/admin/production/:channelId/:action` (`start`, `stop`,
`test-closing`) resolves the channel's registered app origin and forwards the
call with a server-side credential from the central
`channel_app_control_tokens` table (`channel_id` → `control_token`). The bears
env token remains as that channel's fallback. The browser only ever holds the
operator's admin token. `GET /api/admin/production/status` reports, per
in-scope registered app, its `GET /api/health` and `GET /api/channel`
snapshots plus whether a control credential is configured.

## API surface

All routes require `Authorization: Bearer <token>` and enforce the token's
scope.

| Route | Methods | Notes |
|---|---|---|
| `/api/admin/info` | GET | version, token scope, per-database configured/connected probes |
| `/api/admin/schedules` | GET, POST | `station_schedule_rules`; filters `channelId`, `stationId`, `programId`, `enabled=false`; scoped tokens only see their channels. |
| `/api/admin/schedules/:id` | PATCH, DELETE | PATCH merges `schedule` JSONB fields and/or `enabled`, always resets `next_run_at = NULL`. DELETE disables — never removes. |
| `/api/admin/sessions` | GET, POST | `station_program_slots`; filters `channelId`, `stationId`, `programId`, `status`, `scope=all`, `limit`. POST inserts a one-off slot; unique-slot conflict → 409. |
| `/api/admin/sessions/:id` | PATCH | `startsAt`/`endsAt` (validated end>start pre-write), `status`, `title` (→ `metadata.title`) |
| `/api/admin/sessions/:id/cancel` | POST | `status='cancelled'` |
| `/api/admin/channels` | GET | Channels from central bindings + the app registry; the configured app database's checkpoints are optional enrichment. |
| `/api/admin/meta` | GET | `stations` + `programs` picklists for create forms (scoped tokens only see programs bound to their channels) |
| `/api/admin/programs/:id` | PATCH | partial update of `name`, `description`, `tagline` (empty strings clear copy) |
| `/api/admin/production/status` | GET | per-app health/channel snapshots + app-database checkpoints (app failures are data, never request failures) |
| `/api/admin/production/:channelId/:action` | POST | `start`/`stop`/`test-closing` proxied to that channel's registered app with its control credential |

## Mutation semantics

- **No destructive deletes** (project rule + scheduler design): rules toggle
  `enabled`, slots set `status='cancelled'`. Both are reversible and keep rows
  auditable.
- **Schedule edits**: writing `schedule` JSONB plus `next_run_at = NULL` is the
  documented revision path — the leader's slot scheduler recomputes and
  materializes on its next ~30s tick, so no reload endpoint is needed.
- **Slots**: `ON CONFLICT (station_id, program_id, starts_at) DO NOTHING`
  guards against duplicates, matching the scheduler's own idempotent writes.
- **Channel identity** is central: create a channel by binding a program to a
  channel id with a schedule rule (Schedules tab). Rows in an app's own
  `channels` table are that app's concern, not the admin's.

## Running locally

```bash
cd channels && npm run dev          # API on :4000
cd channels/admin && npm run dev    # SPA on :5174 (proxies /api → :4000)
```

bears-live-app's server also defaults to :4000 — give it another port or set
`BEARS_API_BASE_URL` accordingly when running all three.

## Deploy

`channels` `build` installs + builds the SPA into `public/admin/` (gitignored
build output), then `next build`. The SPA is served at `/admin` — the token
gate is the only access control, same as ControlRoom.

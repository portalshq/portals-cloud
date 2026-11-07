# Channels admin

Operator console for channel scheduling, ported from
`massively-social-ebook/admin` (ControlRoom) onto the station-grid schema used
by `bears-live-app`. Read `SCHEDULING.md` first for the scheduling model.

## Components

| Piece | Path | What it is |
|---|---|---|
| SPA | `admin/` | Standalone Vite + React + Tailwind app (not an npm workspace). Tabs: Sessions, Schedules, Channels, Production. |
| API | `app/api/admin/*` | Next.js route handlers; the SPA's `/api/admin` calls land here. |
| Data layer | `lib/admin/` | Lazy `pg` pools (`db.ts`), bearer guard (`auth.ts`), env (`env.ts`), ScheduleConfig validation (`schedule.ts`), DTOs (`types.ts`). |

## Environment variables

| Var | Purpose |
|---|---|
| `CHANNELS_ADMIN_TOKEN` | Bearer token required by every `/api/admin/*` route. Unset → all routes 503. |
| `ADMIN_APP_DATABASE_URL` | Bears **app** database (`channels`, `program_sessions`, `production_checkpoints`). |
| `ADMIN_CENTRAL_DATABASE_URL` | Central platform database (`stations`, `programs`, `station_schedule_rules`, `station_program_slots`, `next_program_session`). |
| `BEARS_API_BASE_URL` | Bears server origin for status reads and production proxying. |
| `BEARS_PRODUCTION_CONTROL_TOKEN` | Server-only bearer forwarded to bears `POST /api/production/*`. Never reaches the browser. |

SPA-side (admin/.env*, gitignored): `VITE_ADMIN_API_ORIGIN` (dev proxy target,
default `http://localhost:3001`), `VITE_POLL_INTERVAL_MS`, optional
`VITE_ADMIN_TOKEN`.

## API surface

All routes require `Authorization: Bearer <CHANNELS_ADMIN_TOKEN>`.

| Route | Methods | Notes |
|---|---|---|
| `/api/admin/info` | GET | version + per-database configured/connected probes |
| `/api/admin/schedules` | GET, POST | `station_schedule_rules`; filters `channelId`, `stationId`, `programId`, `enabled=false` |
| `/api/admin/schedules/:id` | PATCH, DELETE | PATCH merges `schedule` JSONB fields and/or `enabled`, always resets `next_run_at = NULL`. DELETE disables — never removes. |
| `/api/admin/sessions` | GET, POST | `station_program_slots`; filters `channelId`, `stationId`, `programId`, `status`, `scope=all`, `limit`. POST inserts a one-off slot; unique-slot conflict → 409. |
| `/api/admin/sessions/:id` | PATCH | `startsAt`/`endsAt` (validated end>start pre-write), `status`, `title` (→ `metadata.title`) |
| `/api/admin/sessions/:id/cancel` | POST | `status='cancelled'` |
| `/api/admin/channels` | GET, POST | App `channels` joined with `production_checkpoints`, central binding (station/program), and next upcoming slot. POST also seeds a `stopped` checkpoint in one transaction. |
| `/api/admin/channels/:id` | PATCH | rename only — the id is a referenced PK |
| `/api/admin/meta` | GET | `stations` + `programs` picklists for create forms |
| `/api/admin/production/status` | GET | checkpoints + bears `/api/health` + `/api/channel` (bears failures are data, never request failures) |
| `/api/admin/production/:action` | POST | `start`/`stop`/`test-closing` proxied to bears with the control token |

## Mutation semantics

- **No destructive deletes** (project rule + scheduler design): rules toggle
  `enabled`, slots set `status='cancelled'`. Both are reversible and keep rows
  auditable.
- **Schedule edits**: writing `schedule` JSONB plus `next_run_at = NULL` is the
  documented revision path — the leader's slot scheduler recomputes and
  materializes on its next ~30s tick, so no reload endpoint is needed.
- **Slots**: `ON CONFLICT (station_id, program_id, starts_at) DO NOTHING`
  guards against duplicates, matching the scheduler's own idempotent writes.

## Running locally

```bash
cd channels && npm run dev          # API on :3001
cd channels/admin && npm run dev    # SPA on :5174 (proxies /api → :3001)
```

bears-live-app's server also defaults to :3001 — give it another port or set
`BEARS_API_BASE_URL` accordingly when running all three.

## Deploy

`channels` `build` installs + builds the SPA into `public/admin/` (gitignored
build output), then `next build`. The SPA is served at `/admin` — the token
gate is the only access control, same as ControlRoom.

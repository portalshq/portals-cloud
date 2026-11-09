# Channels Admin

> Operator console for Portals channel scheduling: schedule rules, session
> windows, channel info, and production controls for `bears-live-app`.
> Standalone Vite + React app living at `channels/admin`; its API is served by
> the channels Next.js app at `/api/admin/*` (see `../lib/admin/` and
> `../app/api/admin/`).

Ported from `massively-social-ebook/admin` (ControlRoom) and reworked for the
station-grid schema (`station_schedule_rules`, `station_program_slots`).

---

## Architecture

```
channels/admin/        ← this SPA (Vite, React 18, Tailwind)
channels/app/api/admin ← Next.js route handlers (the backend)
channels/lib/admin     ← pg pools, bearer auth, schedule validation
channels/public/admin  ← build output, served at /admin (gitignored)
```

- **Auth**: every request sends `Authorization: Bearer <token>`; the channels
  app compares it to `CHANNELS_ADMIN_TOKEN`. Enter the token in the UI, pass
  `?token=` in the URL, or set `VITE_ADMIN_TOKEN` (build-time, last resort).
- **Data**: route handlers query the bears app database
  (`ADMIN_APP_DATABASE_URL`) and the central platform database
  (`ADMIN_CENTRAL_DATABASE_URL`) directly. See `../docs/ADMIN.md` for the env
  reference and `../docs/SCHEDULING.md` for scheduling semantics.
- **No deletes**: rules are disabled (`enabled=false`), sessions are cancelled
  (`status='cancelled'`). Schedule edits reset `next_run_at` to NULL so the
  bears slot scheduler rematerializes windows on its next ~30s tick.

## Tabs

| Tab | Backing store | Operations |
|---|---|---|
| Sessions | `station_program_slots` (central) | list/filter, create one-off slot, edit window/status/title, cancel |
| Schedules | `station_schedule_rules` (central) | list, create, edit recurrence JSONB, enable/disable |
| Channels | `channels` + `production_checkpoints` (app) | list w/ mode + binding + next session, rename, create |
| Production | checkpoints + bears HTTP | status, start/stop/test-closing via `/api/production/*` proxy |

## Development

```bash
# terminal 1 — channels app (serves /api/admin/*)
cd .. && npm run dev            # next dev on :3001

# terminal 2 — this SPA
npm install                     # first time only
npm run dev                     # vite on :5174, proxies /api → :3001
```

Open http://localhost:5174 — the token screen accepts the admin token.

Dev env: copy `.env.example` to `.env.local` (or `.env.development`) and fill
in — `VITE_ADMIN_API_ORIGIN` (proxy target, dev default `:4000`),
`VITE_POLL_INTERVAL_MS`, optional `VITE_ADMIN_TOKEN`. `*.local` files stay
untracked. The server-side vars this SPA talks to live in
`../.env.example`.

**Port note**: bears-live-app's server also defaults to :3001. When running
bears + channels together, point `BEARS_API_BASE_URL` at wherever bears
actually listens.

## Build & deploy

```bash
npm run build   # tsc + vite build → ../public/admin (base /admin/)
```

The channels `build` script runs this first (`npm --prefix admin install &&
npm --prefix admin run build`), then `next build`, so a channels deploy ships
the SPA at `/admin` automatically.

## Tests

```bash
npm test        # vitest run
```

Covers the API client, polling hook, and date helpers. Backend route-handler
tests live one level up in `../test/admin-*.test.ts`.

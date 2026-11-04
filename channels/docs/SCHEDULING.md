# Channel scheduling

How a channel app (e.g. `bears-live-app`) decides when it is on air, how
session windows get created, and how operators revise the grid.

## Concepts

| Thing | Where | What it is |
|---|---|---|
| `station_schedule_rules` | central DB | Recurrence rules (JSONB `schedule`) that say *when* episodes should air |
| `station_program_slots` | central DB | Materialized session windows (`starts_at`/`ends_at`/`status`) — the source of truth for phase and "next session" |
| `next_program_session` | central DB | Each program's next upcoming window, for cross-program conflict checks |
| `program_sessions` | app DB | App-owned occurrences (currently unused by bears-live-app) |
| `production_checkpoints` | app DB | Last reconcile mode (`stopped`/`ambient`/`preparing`/`episode`) |

### `schedule` JSONB shape

```json
{
  "scheduledDays": ["monday", "wednesday", "friday"],   // optional; omit/empty = every day
  "scheduledTime": "19:00",                            // 24h HH:MM in `timezone`
  "timezone": "America/Denver",                        // IANA name
  "episodeDurationMs": 1800000,
  "ambientDurationMs": 900000
}
```

`computeNextWindowForDate` advances **calendar dates**, not elapsed 24h —
DST-safe via `formatInTimeZone`/`fromZonedTime` (`date-fns-tz`).

## Phase resolution

`ProductionSchedule.phase(channelId, now)` answers:

- **`episode`** — an active slot exists (`starts_at <= now < ends_at`,
  status `scheduled`/`live`, and no conflicting `next_program_session` from
  another program overlapping the window)
- **`preparing`** — inside the 5-minute pre-roll before the earliest upcoming
  rule window (and no other program's session conflicts)
- **`ambient`** — otherwise, or on central-DB error (falls back to the clock
  cycle if a `clockFallback` is wired, else `ambient`)

## The slot scheduler

`createStationSlotScheduler` (server/schedule.ts) runs on the production
**leader** each reconcile (~30s). It is the only writer of
`station_program_slots` in bears-live-app:

1. **Due rules** — `next_run_at <= now` names an open occurrence → upsert the
   slot, then advance `next_run_at` fully to the first future occurrence.
2. **Lookahead materialization** — every rule occurrence within 7 days is
   inserted `ON CONFLICT (station_id, program_id, starts_at) DO NOTHING`.
3. **Status sweep** — slots containing `now` → `live`; `ends_at <= now` →
   `completed`.

All writes are idempotent; two leaders racing across failover cannot
double-create a window. Per-rule errors are logged and isolated.

`ensureProgramAndScheduleSeeded` inserts the producer/program/station rows
and one rule if none exists — it **never overwrites an existing rule**.

## Off-air behavior

`OFFAIR_BEHAVIOR` selects what an off-episode phase does:

- `ambient` (default) — generates a calm scene and keeps streaming.
- `closed` — ends video/Reactor sessions once per off-air period, skips all
  generation, and has `/api/channel` return `playback: null` plus
  `nextSession {startsAt, endsAt, title, streamUrl}`. Reactor session grants
  answer 503 while off air. `streamUrl` embeds an HMAC `gt1` guest token
  (`?guest=`, TTL'd to `ends_at + 1h`) so calendar deep links land already
  identified — real auth tokens never go into URLs.

Reminders are zero-config calendar links (no email): the client builds
Google/Outlook deeplinks; `GET /api/sessions/next.ics` serves a
`text/calendar` event with `LOCATION`/`URL` = stream URL and a `-PT6M`
VALARM.

## Revising the schedule

- **Change the seeded rule** — `SCHEDULED_TIME`, `SCHEDULED_DAYS`,
  `SCHEDULED_TIMEZONE` envs apply **only while no enabled rule exists**.
  Seeding is idempotent; editing envs after the seed has no effect.
- **Revise an existing rule** — write to `station_schedule_rules` directly:

  ```sql
  UPDATE station_schedule_rules
  SET schedule = jsonb_set(schedule, '{scheduledTime}', '"18:30"'),
      next_run_at = NULL,   -- let the scheduler recompute
      updated_at = now()
  WHERE station_id = 'my-station' AND program_id = 'bears-live-app'
    AND channel_id = 'bears';
  ```

  Setting `next_run_at = NULL` makes the next tick recompute it; the rule's
  JSONB is the only thing `phase()` and the scheduler read.
- **One-off windows** — insert a `station_program_slots` row directly
  (`ON CONFLICT` protects against the scheduler's lookahead duplicating it).
- **Disable a rule** — `UPDATE station_schedule_rules SET enabled = false`.
  The scheduler skips it; `phase()` sees no upcoming window → ambient/closed.
- **Standalone (no `STATION_ID`)** — the clock cycle anchored at
  `PRODUCTION_CYCLE_START` runs `EPISODE_DURATION_MS` on /
  `AMBIENT_DURATION_MS` off; revising the cadence means changing those envs
  (and the anchor if the phase must shift).

## Launch config: single daily 30-minute episode

```bash
EPISODE_DURATION_MS="1800000"   # 30-minute sessions
OFFAIR_BEHAVIOR="closed"        # off air between sessions (no ambient stream)
SCHEDULED_TIME="19:00"          # one daily episode…
SCHEDULED_DAYS=""               # …every day of the week
SCHEDULED_TIMEZONE="America/Denver"
STATION_ID="<your-station>"
CENTRAL_DATABASE_URL="<central pg url, different DB than DATABASE_URL>"
APP_URL="https://<public origin>"   # used in reminder deep links
```

Run `npm run db:migrate && npm run db:migrate:central` before enabling
station mode. If the channel already has a seeded rule at a different
time/days, revise it with the SQL above — envs alone will not move it.

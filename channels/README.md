# Channels

Channels is the Next.js service and operator console for Portals channels. The
operator console lives in `admin/`; the Bears live experience is developed in
the sibling `bears-live-app/` project.

## Run the local development stack

With the Portals workspace root open in VS Code, run `Tasks: Run Task` →
`Start Channels + Bears (all)`. VS Code launches each process in its own
dedicated terminal panel.

From this directory, the same stack can also be started from a terminal:

```bash
node scripts/dev-all.mjs
```

The launcher starts Channels, its admin UI, the Bears client on localhost, the
Bears dry-run server, and a second Bears client bound to `100.125.2.45`. It
requires `100.125.2.45` to be assigned to this machine. Press Ctrl+C to stop
the stack; if any process exits, the launcher stops the remaining processes.

| Service | URL |
|---|---|
| Channels | `http://100.125.2.45:4000` |
| Channels admin | `http://localhost:5174/admin/` |
| Bears client (localhost) | `http://localhost:5173` |
| Bears client (network host) | `http://100.125.2.45:5175` |
| Bears dry-run API | `http://localhost:3001` |

The dry-run script requires the Docker CLI and its configured remote SSH Docker
context. It may create or start the dry-run Postgres containers, apply database
migrations, seed dry-run data, build the Channels client bundle, and open SSH
forwards on ports `55432` and `55433`. The SSH tunnel closes when the stack
stops; the dry-run database containers remain running. See the
[Bears dry-run documentation](../../bears-live-app/README.md#dry-run-mode) and
[`run-dryrun.sh`](../../bears-live-app/scripts/run-dryrun.sh) for configuration
and lifecycle details.

## Routes at a glance

- `/` is the scroll feed. Only the active program preview plays media or
  refreshes chat. It shows up to three public messages by default; enter the
  room to post. Off-air previews retain the session schedule.
- `/channels` is the browsable index. All program entries link to their room,
  even before a show begins.
- `/<slug>` is the canonical program room. It opens the program's stage or
  off-air lobby without redirecting.
- `/embed/<slug>` is the program room framed for the X Player Card.
- `/embed/<slug>?variant=preview` is the read-only room preview. Set
  `CHANNELS_PREVIEW_FRAME_ORIGINS` to comma-separated, exact HTTPS partner
  origins if needed. This does not widen full-player framing.
- `/g/<code>` opens a group's current room. `/embed/g/<code>` tracks the same
  program and starts muted so X can remain the audio host.

A channel is a creator tenant, not a program or a station. Programs have their
own public slugs and app registrations. Stations schedule programs without
overlapping live or scheduled slots. Apply central migrations `0011` and
`0012` before enabling groups and the shared conversation. See
[program registration](docs/CHANNEL-APPS.md) and [X Player Cards](docs/X-PLAYER-CARD.md)
for rollout details.

See [Channel content by page](docs/CHANNEL-CONTENT.md) for the full diagram.

## Share a program on X

Program room links (`/<slug>`) render as playable X Player Cards. X frames the
slim player at `/embed/<slug>`, the only route Channels allows to be framed.
See [Share a program on X](docs/X-PLAYER-CARD.md) for the routes, sandbox
limits, and test steps.

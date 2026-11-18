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

- `/` is the scroll feed: one full-height panel per channel, one active player
  at a time. While a program is off-air its panel mounts the program room
  itself — the app's own off-air stage — and flips back to the player when
  the next session starts. Channels without a program get a room card:
  title, off-air line, and the next-session card — the follow action renders
  only when a program is bound.
- `/channels` is the browsable index. Entries for off-air channels open the
  channel's feed panel (`/#channel-<slug>`) rather than a room.
- `/<slug>` is the channel room. Program apps mount their watch bundle only
  while the program is on air; an off-air room URL redirects to the feed
  panel. Channels without an app render channel details plus an HLS stage.
- `/embed/<slug>` is the program room framed for the X Player Card.

See [Channel content by page](docs/CHANNEL-CONTENT.md) for the full diagram.

## Share a program on X

Program room links (`/<slug>`) render as playable X Player Cards. X frames the
slim player at `/embed/<slug>`, the only route Channels allows to be framed.
See [Share a program on X](docs/X-PLAYER-CARD.md) for the routes, sandbox
limits, and test steps.

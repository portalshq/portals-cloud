# Channels

Channels is the Next.js service and operator console for Portals channels. The
operator console lives in `admin/`; the Bears live experience is developed in
the sibling `bears-live-app/` project.

## Run the local development stack

From this directory, start all five processes with:

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

# Channels

Channels is the Next.js service and operator console for Portals channels. The operator console lives in `admin/`.

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
`0012`, then `0013`, before enabling groups and the shared conversation.
Migration `0013` enforces program-to-creator ownership on new schedule writes
and scopes public chat to a program. See [program registration](docs/CHANNEL-APPS.md),
[viewer groups](docs/GROUPS.md), and [X Player Cards](docs/X-PLAYER-CARD.md)
for rollout details.

See [Channel content by page](docs/CHANNEL-CONTENT.md) for the full diagram.

## Share a program on X

Program room links (`/<slug>`) render as playable X Player Cards. X frames the
slim player at `/embed/<slug>`, the only route Channels allows to be framed.
See [Share a program on X](docs/X-PLAYER-CARD.md) for the routes, sandbox
limits, and test steps.

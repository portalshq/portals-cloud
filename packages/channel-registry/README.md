# @portalshq/channel-registry

Loads, validates, PX-refreshes, and atomically persists a deployment-local channel registry.

## Central program metadata

`readProgramMetadata(query, programId)` reads a program's public description,
tagline, page title, social site name, default share image, and theme color.
`updateProgramPromotionalCopy(query, programId, copy)` updates the description
and tagline and returns null when the program does not exist.
`updateProgramDetails(query, programId, patch)` updates any subset of `name`,
`description`, and `tagline` (only provided fields are written) and returns
null when the program does not exist. All accept a parameterized SQL query
function; the host must authorize updates before calling them. Empty strings
are intentional values. Do not store credentials or private production
configuration in these fields.

Apply `sql/001_program_metadata.sql` through the central database migration
system before using the metadata functions. It extends the existing `programs`
table and does not create or modify program records.

## Channel admin credentials

`sql/003_channel_admin.sql` creates the central tables that drive the
Channels admin (`cloud/channels`):

- `channel_admin_tokens` — scoped admin tokens. `token_hash` is
  sha256(token) hex; `channel_ids` lists the channel slugs the token may view
  and mutate. The env token `CHANNELS_ADMIN_TOKEN` remains the all-channels
  superuser.
- `channel_app_control_tokens` — the server-side bearer forwarded to a
  registered app's `POST /api/production/*`, keyed by channel slug. The app's
  origin comes from `programs.app_origin` (see `sql/002_channel_app_origin.sql`).

# @portalshq/channel-registry

Loads, validates, PX-refreshes, and atomically persists a deployment-local channel registry.

## Central program metadata

`readProgramMetadata(query, programId)` reads a program's public description,
tagline, page title, social site name, default share image, and theme color.
`updateProgramPromotionalCopy(query, programId, copy)` updates the description
and tagline and returns null when the program does not exist. Both accept a
parameterized SQL query function; the host must authorize updates before
calling them. Empty strings are intentional values. Do not store credentials
or private production configuration in these fields.

Apply `sql/001_program_metadata.sql` through the central database migration
system before using the metadata functions. It extends the existing `programs`
table and does not create or modify program records.

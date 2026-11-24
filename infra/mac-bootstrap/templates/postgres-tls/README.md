# PostgreSQL TLS files

Provide these service-owned files before starting the production database:

- `ca.crt`: private CA trusted by the Channels server workload.
- `server.crt`: certificate with `db.portals.works` in its SAN.
- `server.key`: matching private key, mode `0400`.
- `pg_hba.conf`: requires a valid client certificate plus SCRAM for
  `channels_app` only.

Do not reuse Caddy's private key. The database container requires TLS 1.3 or
newer. Issue a separate `channels_app` client certificate and put its CA,
certificate, key, and SCRAM database URL in Vercel encrypted environment
variables; browsers must never receive them.

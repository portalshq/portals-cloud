# AGENTS.md — Production Presign Architecture

Scope: everything needed to make Lore presigned URLs production-ready.
Incident background and full requirements checklist:
`../../px/docs/authored/production-presign-requirements.md`.

## Map

| Concern | Owner | Location |
|---|---|---|
| Redeem handler (`401` shape, response headers) | lore submodule | `lore/lore-server/src/http/presigned/repository/redeem.rs` |
| Mint handler (TTL clamp, token fields) | lore submodule | `lore/lore-server/src/http/repositories/repository/contents/content/presign_repository_content.rs` |
| Token sign/verify | lore submodule | `lore/lore-server/src/http/presign_token.rs` |
| Server settings (TTL bounds, key config) | lore submodule | `lore/lore-server/src/http/server.rs`, `lore/lore-server/src/settings.rs` |
| Prod deployment (image, config, key provisioning) | this dir | `Dockerfile.loreserver*`, `config/`, `versions.yaml` |
| Mint client (what `px presign` sends) | px repo (sibling) | `../../px/crates/px-core/src/resolver.rs` (`LorePresignRequest`) |

## Facts established (don't re-derive)

- Expired/invalid tokens redeem as `401 text/plain "invalid or expired token"`
  (`redeem.rs:68-71`). That is what browsers render as a "text file".
- The redeem handler **already honors** `content_type`, `content_encoding`,
  `content_disposition` from the token payload (`redeem.rs:159-176`), and the
  mint endpoint **already accepts** them (`PresignRequest`, mint handler
  `:77-82`). They are `None` in practice because `px`'s mint request sends
  only `ttl_seconds`. So the missing-`Content-Type` fix is primarily a
  **px-side** change (send hints at mint), not a server change.
- TTL is clamped server-side to `[min_ttl_seconds, max_ttl_seconds]`
  (defaults 1 / 3600 / 86400). Out-of-range TTLs are silently clamped, never
  rejected.
- `server.http.presigned_url_hmac_key` absent ⇒ feature disabled; present but
  short/invalid hex ⇒ server refuses to start. Env override:
  `LORE__SERVER__HTTP__PRESIGNED_URL_HMAC_KEY`. `config/dev.toml` contains a
  `deadbeef…` placeholder — never ship that to prod; prod key comes from the
  secret manager, fresh per deployment, ≥32 bytes (`openssl rand -hex 32`).

## Rules for prod work here

- Submodule discipline: `lore/` is a pinned submodule (`portalshq/lore`) with
  its own `AGENTS.md` (release/version/tag policy, local release gate,
  required checks). Any server-code change must go through that gate and the
  `verify-and-promote` flow into `versions.yaml` — no ad-hoc prod builds.
- Key rotation must not mass-invalidate live URLs: overlap key acceptance via
  the `key_id` already in the token payload before rotating the primary.
- Keep bad-signature responses indistinguishable; `expired` may be
  distinguished (expiry is base64-readable in the token, so it is not secret).
  Prefer structured problem-JSON over the current `text/plain` strings.
- Safe serving on redeem: real `Content-Type` (never sniffable default),
  `nosniff`, `private, no-store`, `no-referrer`, `attachment` for non-image
  types, dedicated download origin. A committed HTML/SVG served executable
  from the API origin with bearer URLs in play is a stored-XSS vector.

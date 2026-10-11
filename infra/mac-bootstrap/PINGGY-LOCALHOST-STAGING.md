# Pinggy localhost staging (no customer domain)

This is a temporary external-staging route, not the production DNS/certificate
configuration. Pinggy forwards to loopback on the Mac; remote testers still
need the Pinggy-assigned public hostname and, for TCP/UDP, the assigned port.
The hostname and ports come from the Pinggy dashboard or tunnel startup output,
not Squarespace or Cloudflare. Do not guess them or commit the token/commands.

## Why the three names appear in the production configuration

Pulumi already selects `auth.portals.works` for Auth and `lore.portals.works`
for Lore gRPC (production config and the shared dev config). These are intended
production names; the Mac release examples now use them instead of generic
domain placeholders. Their current DNS routing and certificate issuance still
need live verification. The Pinggy staging endpoint is separate and must not
silently replace these production names.

- `AUTH_DOMAIN` is Auth Gateway's externally visible HTTPS origin. It is used
  for the JWT issuer, JWKS URL, and the ZITADEL callback (`/callback`). The
  configured values must agree exactly or clients reject tokens/callbacks.
- `LORE_DOMAIN` is Caddy's TLS/SNI route to Lore gRPC. It is separate in the
  current Caddy configuration so Auth and Lore have distinct routes/cert names.
  A public hostname is not needed for local-only calls; it is needed when a
  remote client must reach this route and validate its TLS identity.
- `LORE_QUIC_HOST` (and `LORE_QUIC_PORT`) identifies Lore's direct UDP/QUIC
  endpoint. QUIC uses TLS, so the Lore certificate and client SNI/verification
  must agree with the endpoint hostname. It is not routed through Caddy.

These are roles, not a requirement to buy three custom domains. If Pinggy
accepts controlled custom TLS domains, use `staging-auth.portals.works` and
`staging-lore.portals.works` for staging. One Cloudflare DNS-01
`*.portals.works` certificate then covers staging and production Auth/Lore
names without moving production DNS. Pinggy-assigned hostnames are outside
that certificate. gRPC and QUIC forwarding are separate protocol paths and
must use the endpoints the dashboard actually provisions. Whether a single
paid seat can reserve and run all required mappings concurrently must be
verified in the account; documentation alone does not prove this account's
quota.

## What can be tested without a custom domain

The dashboard's **Local address** is the Mac-side destination. For this
Compose stack, the intended targets are:

| Test | Pinggy tunnel type | Local address on the Mac | Important limit |
| --- | --- | --- | --- |
| Auth browser/API over HTTPS | HTTP(S) | `http://127.0.0.1:8085` | Pinggy terminates public TLS. Set the staging Auth issuer/callback to the actual Pinggy HTTPS URL. This is not gRPC or end-to-end TLS validation. |
| Auth and Lore gRPC over TLS | TLS passthrough | `127.0.0.1:8443` (Caddy) | Controlled staging names can use the wildcard certificate if Pinggy accepts their custom-domain mapping. Pinggy-assigned names need another certificate path. |
| Lore QUIC | UDP | `127.0.0.1:41337` | Reserve a stable UDP mapping. Reusing the wildcard certificate requires the client to validate a controlled hostname while reaching that mapping; this is unverified. |

Use `127.0.0.1`, not `localhost`, if the dashboard accepts an IP literal; both
refer to the Mac loopback here. Do not publish Auth internal ports `8086` or
`8087`, Lore health `41339`, or Docker ports directly. If only testing locally,
skip Pinggy: Auth's HTTP health endpoint is `127.0.0.1:8085/healthz`, and the
deployment's local service checks should be used for Lore/ReBAC.

1. Keep the first phase entirely local: start Auth, Caddy, and Lore only after
   the existing fail-closed preflight passes; verify Auth health/JWKS, Caddy's
   local TLS/SNI route, Lore readiness/ReBAC, and local database/storage tests.
   This phase needs no Pinggy endpoint.
2. For external browser/API reachability, use Pinggy's HTTPS/HTTP tunnel to the
   specific loopback HTTP listener that is intended for that test. Pinggy's
   HTTPS URL uses a Pinggy-managed certificate and its HTTP tunnel terminates
   TLS at Pinggy before forwarding to the Mac. This is useful for temporary
   OIDC/browser testing, but is not evidence of client-to-Mac TLS passthrough.
   Set the staging Auth issuer and exact ZITADEL callback to the actual stable
   Pinggy URL, then re-run the Auth/JWKS/token tests. Never register a guessed
   or ephemeral URL as the production callback.
3. For direct gRPC TLS/SNI tests, use the Pinggy TLS passthrough mapping only
   after confirming the local endpoint presents a certificate valid for the
   client hostname. Pinggy's TLS tunnel does not terminate TLS. Cloudflare
   DNS-01 can validate controlled `portals.works` names, but not Pinggy-owned
   names. The reviewed Pinggy docs do not establish that TLS-ALPN issuance for
   an assigned hostname is supported; a locally trusted test CA can test
   protocol behavior but does not validate public certificate trust.
4. For QUIC, reserve a persistent UDP endpoint in the Pinggy dashboard and
   forward it directly to Lore's loopback UDP port. UDP tunneling is documented
   as beta. Determine whether the pinned client can reach this endpoint while
   validating a controlled hostname covered by the wildcard certificate.
   Pinggy's relay custom-domain guide explicitly excludes UDP; do not assume
   a CNAME makes it supported. If this cannot be proven, QUIC remains blocked.
   A UDP port-open check alone is not a QUIC acceptance test.

## Required operator-provided values before starting a tunnel

After signing into the Pinggy dashboard, obtain the persistent HTTPS/TCP/TLS
mapping details and the persistent UDP hostname/port, if offered. Keep the
generated token/commands private. Confirm that the requested mappings can run
simultaneously on this paid allocation. Then configure a staging-only release
file with the actual endpoint(s), Auth issuer/callback, and corresponding
certificate trust. Do not copy a Pinggy token or private key into chat or this
repository. Until these values and service-owned runtime files exist, no public
tunnel should be started.

The dashboard-generated command shown to the operator included
`StrictHostKeyChecking=no` and a Pinggy access token was exposed in the chat.
Revoke/rotate that token before any use. Do not run the generated command with
host-key checking disabled. Verify the SSH gateway fingerprint using a trusted
Pinggy channel, place the verified key in the service account's
`/Users/portals-svc/.ssh/known_hosts`, and require both
`-o StrictHostKeyChecking=yes` and
`-o UserKnownHostsFile=/Users/portals-svc/.ssh/known_hosts` in each persistent
tunnel command. The supervisor now rejects commands that disable checking or
omit the pinned known-hosts file. Do not trust `ssh-keyscan` output by itself;
compare its fingerprint against the independently verified Pinggy fingerprint.

## Official references

- [Pinggy HTTP(S) tunnels](https://pinggy.io/docs/http_tunnels/) — assigned
  HTTP/HTTPS URL and TLS termination behavior.
- [Pinggy TLS tunnels](https://pinggy.io/docs/tls_tunnels/) — TLS passthrough;
  the local endpoint terminates TLS.
- [Pinggy UDP tunnels](https://pinggy.io/docs/udp_tunnels/) — beta and
  persistent port reservation through the dashboard.
- [Pinggy persistent subdomains](https://pinggy.io/docs/persistent_subdomain/)
  — source of stable Pinggy hostnames.
- [Pinggy CLI](https://pinggy.io/docs/cli/) — forwarding to localhost.
- [ZITADEL OIDC endpoints](https://zitadel.com/docs/apis/openidoauth/endpoints)
  — `redirect_uri` must exactly match a preregistered URI.

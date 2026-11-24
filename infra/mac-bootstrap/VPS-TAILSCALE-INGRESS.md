# VPS + Tailscale ingress design

**Status: planned.** This document records the approved replacement design for
Pinggy. It is not a cutover instruction and does not change the currently
running Pinggy, Funnel, Cloudflare Tunnel, Auth, or Lore services.

## Decision

Use one small public VPS as a TCP/UDP ingress node and managed Tailscale as the
private transport to `andresb`. Use Cloudflare's ordinary proxied DNS edge for
the TCP hostnames. Do not use Cloudflare Tunnel for Auth or Lore: Cloudflare
documents that public-hostname Tunnel routes do not support gRPC.

Do not introduce Headscale for this two-node deployment. It would replace the
managed coordination service with an additional production control plane,
database, backups, upgrades, certificate management, and optional DERP/STUN
operations. If managed Tailscale pricing is unacceptable, evaluate direct
WireGuard before Headscale.

## Target topology

```text
auth.portals.works / lore.portals.works
client -> Cloudflare proxy -> VPS HAProxy TCP/443 -> Tailscale -> andresb Caddy :8443

lore-quic.portals.works UDP/443
client -> DNS-only VPS address -> VPS nftables -> Tailscale -> andresb Lore :41337/udp
```

HAProxy is a raw TCP proxy. It does not terminate or inspect TLS; Caddy on the
Mac continues to select Auth or Lore from the original SNI hostname and owns
the origin certificate. The public Cloudflare edge terminates client TLS and
opens a separately verified TLS connection to Caddy through the VPS.

## Hostnames and DNS

| Hostname | Cloudflare DNS mode | Public protocol | Origin |
| --- | --- | --- | --- |
| `auth.portals.works` | Proxied | HTTPS + gRPC/TCP 443 | VPS TCP 443 |
| `lore.portals.works` | Proxied | gRPC/TCP 443 | VPS TCP 443 |
| `lore-quic.portals.works` | DNS-only | Lore QUIC/UDP 443 | VPS UDP 443 |

Enable the Cloudflare zone's gRPC setting and use **Full (strict)** origin TLS.
Cloudflare's gRPC edge supports Free plans, but this must be proven with the
actual Auth and Lore clients before canonical DNS is changed.

`lore-quic.portals.works` deliberately has one label below `portals.works`, so
the existing `*.portals.works` wildcard certificate can cover it. Confirm this
against the exact Lore QUIC certificate before changing `LORE_QUIC_HOST`.

The Cloudflare Tunnel named `portals-andresb-web` remains for Bears and Ebook
HTTPS/WebSocket workloads. It must not carry HLS or generated media bytes.

## VPS baseline

Provision a current Debian LTS VPS with 1 GB memory, one public IPv4 address,
and provider-console recovery. A 1 GB DigitalOcean Basic Droplet is the
reference sizing; the VPS is an ingress relay, not an app or media server.

Install only:

- Tailscale, authenticated with a tagged infrastructure identity.
- HAProxy in `mode tcp`, listening on TCP 443 and forwarding to the Mac's
  Tailscale TCP-forwarding port.
- nftables for the UDP 443 DNAT/SNAT path and coarse source-rate limits.
- unattended security updates and time synchronization.

Do not install Docker, databases, application source, media storage, or a
general-purpose public SSH service on this node. Use Tailscale SSH for normal
administration and the provider console only for recovery.

Public firewall policy:

- TCP 443: Cloudflare IP ranges only.
- UDP 443: Internet, rate-limited, forwarded only to Lore.
- UDP 41641: Tailscale/WireGuard transport.
- All other inbound traffic: deny.

The UDP SNAT is required for symmetric return traffic through the VPS. Lore
will therefore see the VPS as the network source for QUIC; do not depend on
Lore's source-IP limits for public UDP abuse control.

## Mac baseline

Keep Caddy published only on `127.0.0.1:8443`. Expose it to the tailnet as a
raw TCP stream, managed durably by the deployment:

```sh
tailscale serve --bg --tcp=8443 tcp://127.0.0.1:8443
```

This is not a public Funnel. It lets only authorized tailnet peers reach the
existing TLS listener while preserving its original TLS/SNI bytes.

Add a second Lore UDP mapping bound only to the Mac's current Tailscale IPv4:

```yaml
- "${ANDRESB_TAILSCALE_IP}:41337:41337/udp"
```

Retain the existing loopback UDP mapping. Deployment preflight must resolve the
configured value from `tailscale ip -4`, reject any non-Tailscale address, and
reject a binding on `0.0.0.0` or a LAN interface.

## Tailscale policy

Use tagged devices:

- VPS: `tag:portals-ingress`
- Mac: `tag:portals-mac`

Use deny-by-default grants permitting only:

- `tag:portals-ingress` to `tag:portals-mac:8443/tcp`
- `tag:portals-ingress` to `tag:portals-mac:41337/udp`
- named administrator devices to VPS/Mac SSH

No customer device joins the tailnet. Customers use the public DNS hostnames.

## Rollout and rollback

1. Provision and harden the VPS without changing production DNS.
2. Establish the tagged Tailscale mesh and test both private transport paths.
3. Add Mac TCP forwarding and the Tailscale-only Lore UDP bind.
4. Configure HAProxy and nftables; verify there is no LAN/public listener on
   the Mac.
5. Use staging hostnames and matching certificates to test Auth JWKS/callback,
   Auth gRPC, Lore gRPC, Lore QUIC, PX login, repository access, and
   cross-repository denial.
6. Enable Cloudflare gRPC, create the production records, and lower DNS TTLs.
7. Change `LORE_QUIC_HOST=lore-quic.portals.works` and
   `LORE_QUIC_PORT=443`; restart Lore only after certificate verification.
8. Run the full external acceptance suite from a non-tailnet client.
9. Keep Pinggy TCP and UDP alive throughout an observation window. Roll back by
   restoring its DNS/mapping values; never roll back a database or certificate
   change as part of transport rollback.
10. Remove Pinggy only after the acceptance report and observation window pass.

## Acceptance gates

- Cloudflare-proxied Auth JWKS and OIDC callback work with valid TLS.
- Auth gRPC and Lore gRPC work with normal client discovery, without manual
  SNI overrides.
- PX completes login, repository reads/writes, and reciprocal cross-repository
  denial through the canonical endpoints.
- Lore QUIC works at `lore-quic.portals.works:443` with a valid certificate.
- VPS loss, Mac loss, Tailscale loss, and Pinggy rollback drills have written
  evidence.
- The VPS never carries HLS, streamed media, application data stores, or
  secrets other than its tagged Tailscale identity.

## Cost assumption

The reference architecture is approximately $6/month for a 1 GB VPS plus
Tailscale Standard at $8 per active commercial user/month, before tax and
optional backups. If Tailscale is already paid for, the incremental network
cost is the VPS. Cloudflare's Free gRPC edge is used without paid Cloudflare
add-ons. Recheck provider pricing before provisioning.

## References

- [Cloudflare gRPC](https://developers.cloudflare.com/network/grpc-connections/)
- [Cloudflare Tunnel routing](https://developers.cloudflare.com/tunnel/concepts/routing/)
- [Tailscale Serve TCP forwarding](https://tailscale.com/docs/reference/tailscale-cli/serve)
- [Tailscale grants](https://tailscale.com/docs/features/access-control/grants)
- [Tailscale pricing](https://tailscale.com/pricing)
- [DigitalOcean Droplet pricing](https://www.digitalocean.com/pricing/droplets)


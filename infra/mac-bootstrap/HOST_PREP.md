# Intel Mac host preparation record

This record captures the live SSH probe of the designated host (`andresb`) and
the requirements to satisfy after the planned disk clean and system wipe.

Probe date: 2026-09-26 (America/New_York)

## Live host facts

| Check | Result |
|---|---|
| Model | `MacBookPro14,3` |
| CPU architecture | `x86_64` (Intel) |
| CPUs | 8 logical CPUs |
| Host memory | 16 GiB |
| macOS | 13.7.8, build `22H730` |
| Docker Desktop | 28.3.2; Linux VM reachable |
| Docker architecture | `linux/x86_64` |
| Docker VM CPUs/memory | 8 CPUs / approximately 8 GiB |
| macOS firewall | Enabled |
| FileVault | Disabled at probe time |
| Service account | `portals-svc` absent |
| Installed tools | `curl`, `nc`, `openssl` present; Caddy, Pinggy, `grpcurl`, `jq`, Node.js, and npm absent |
| Power | AC sleep disabled; display/disk sleep still configured |
| Network | Wi-Fi, `192.168.0.27` at probe time |

The previous disk reading showed 76 GiB free. It is intentionally superseded
by the planned wipe; retain at least 100 GiB free after reinstall for images,
Lore workspaces, logs, temporary packages, and recovery evidence.

## Post-wipe requirements

Complete these before running `bootstrap.sh`:

1. Install a macOS version supported by the selected Docker Desktop release.
   Current Docker documentation says macOS 13 support has ended; verify the
   exact maximum supported version for this Intel model before wiping.
2. Enable FileVault and escrow the recovery key separately from the Mac.
3. Create a dedicated non-admin `portals-svc` account. Keep a separate admin
   account for maintenance; do not run services as `andresb`.
4. Install Docker Desktop for Intel and verify `docker info` as the service
   account. Allocate enough VM memory for Auth, Lore, worker, and Caddy.
5. Install or deploy Caddy, Pinggy, `grpcurl`, `jq`, and Node.js 22+ if using
   the npm Pinggy CLI. A standalone Pinggy binary may be used instead of Node.
6. Install services as system `launchd` daemons so they do not depend on an
   interactive login. Keep ordered readiness gates in the supplied scripts.
7. Configure DNS-01 credentials and persistent certificates for Caddy and
   Lore QUIC. Keep private keys outside the repository with service-owned
   read-only permissions.
8. Configure the Pinggy paid token, custom-domain mappings, persistent TCP/TLS
   forwarding, and UDP forwarding. Empirically test gRPC, SNI, reconnect, and
   QUIC before customer traffic.
9. Use `linux/amd64` images for this Intel host. ARM64 images are optional
   future artifacts, not a local deployment requirement.
10. Confirm stable power/network, time synchronization, encrypted off-Mac
    backups, Neon/ZITADEL credentials, and Lore S3/DynamoDB credentials.

## Release acceptance checks

- Docker survives reboot without interactive login.
- Auth, Lore, worker, Caddy, and Pinggy start in dependency order.
- Auth HTTP/gRPC and Lore gRPC pass through the public TLS path.
- Lore QUIC passes through the paid Pinggy UDP mapping.
- Certificates match every public hostname and renew successfully.
- The worker accepts only valid signed wake requests and rejects replayed,
  stale, oversized, and unsigned requests.
- Internal health, database, Docker, SSH, and Lore health ports are not
  publicly reachable.
- Pinggy reconnect preserves expected endpoints and ports.
- Full reboot and recovery evidence is captured before onboarding customers.

## Documentation checked

- [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/)
- [Docker release notes](https://docs.docker.com/desktop/release-notes/)
- [Pinggy CLI](https://pinggy.io/docs/cli/)
- [Pinggy TLS tunnels](https://pinggy.io/docs/tls_tunnels/)
- [Pinggy multiple forwarding](https://pinggy.io/docs/http_tunnels/multi_port_forwarding/)
- [Caddy installation](https://caddyserver.com/docs/install)
- [Apple launchd daemons](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)
- [Apple Platform Security](https://help.apple.com/pdf/security/en_US/apple-platform-security-guide.pdf)

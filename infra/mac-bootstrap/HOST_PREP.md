# Intel Mac production host preparation and release checklist

This record captures the designated host (`andresb`) before and after its
wipe. The latest post-wipe state below was checked over SSH on 2026-10-03.

Initial probe: 2026-09-26; latest post-wipe probe: 2026-10-03

## Live host facts

| Check | Result |
|---|---|
| Model | `MacBookPro14,3` (MacBook Pro 15-inch, 2017) |
| CPU architecture | `x86_64` (Intel) |
| CPUs | 8 logical CPUs |
| Host memory | 16 GiB |
| macOS | 13.7.8, build `22H730` |
| Docker | Docker Desktop 4.43.0 present and running as `andresb`; Engine 28.3.0, `x86_64`; CLI at `/usr/local/bin/docker` |
| Docker socket | `/Users/andresb/.docker/run/docker.sock`, owned by `andresb:staff`; targeted ACL `user:portals-svc allow write` added 2026-10-04 after operator-reported file sharing restriction to `/Users/portals-svc/`. Docker daemon query succeeds as `andresb`; service-identity query remains unverified because `sudo -n -u portals-svc` requires the admin password. Docker Desktop restart may recreate the socket without this ACL. |
| Docker file sharing | Operator reports only `/Users/portals-svc/` remains shared; no containers were running before the reported restart. |
| SSH command PATH | `/usr/local/bin` is omitted; use the absolute Docker CLI path or set a deliberate PATH in launchd jobs |
| macOS firewall | Enabled; rechecked 2026-10-03 |
| FileVault | On; rechecked 2026-10-03; operator confirmed recovery key saved off-Mac |
| Service account | `portals-svc` created as non-admin uid 502, with `/Users/portals-svc` owned by that account; SecureToken disabled |
| Installed tools | Node.js v22.23.3/npm 10.9.9; Pinggy CLI 0.6.0; Vercel CLI 62.2.0; jq 1.8.2; grpcurl 1.9.4. Tools are under `/Users/Shared/portals-tools`; jq, grpcurl, and the Pinggy native addon matched official release checksums. AWS CLI is not installed on this host and is not needed by the Lore container. |
| Power | System sleep enabled; display and disk sleep set to 10 minutes |
| Network | SSH alias `andresb` connected on 2026-10-03; address can change |

The post-wipe root volume has 434 GiB free (466 GiB total); this clears the
100 GiB bootstrap minimum. SSH alias `andresb` and its host key match the saved
known-host entry. `andresb` is an administrator;
SSH key authentication works. Sudo was validated interactively in a shared
`screen` TTY and remains password-protected; no sudoers changes were made.

## Host support and recovery risk

Apple identifies `MacBookPro14,3` as the 15-inch 2017 model and lists macOS
Ventura as its newest compatible OS. This host is already on Ventura 13.7.8.
Docker's current policy supports only the current and two previous major macOS
releases; Docker Desktop 4.48.0 announced Ventura support ending, and 4.49.0
requires macOS 14 or later. The installed Docker Desktop 4.43.0 is older still.
Apple's security-release index lists Ventura 13.7.8 (20 August 2025) as the
latest Ventura security update as of this review (2026-10-02).

Docker is installed and running on this host; compatibility is not a setup
blocker for the current bootstrap, as accepted by the operator. The older OS
and Docker support lifecycle remain an operational/security risk, not a failed
runtime check. Before customer traffic, prove reboot recovery and document the
patch/replacement plan. Do not bypass Apple's model limit with an unofficial
OS patcher.

## Docker account boundary

The current Docker daemon belongs to `andresb`, and its Unix socket is not
writable by `portals-svc`. The service account therefore cannot run the
planned Compose and launchd commands yet. Docker API access allows control of
the daemon and its containers, so granting that socket to another account is
a significant privilege. Keep launchd deployment blocked until the operator
chooses a runtime ownership model and it passes a service-account access test.

## Architecture boundary

This host runs the Mac-side runtime only:

- Auth Gateway
- Lore server
- Caddy
- Pinggy clients

Next.js remains external (currently Vercel). Neon, ZITADEL, Stripe, DNS, and
Lore's production AWS storage remain external dependencies. Lore production
storage is **S3 plus DynamoDB**; the local `/data` volume is disposable cache
and must not be treated as the source of truth.

The ProductCharacters delivery worker is intentionally excluded from this
Portals deployment. Its product workflow and image release are independent;
Portals' MVP needs Auth Gateway, Lore, and the Vercel-hosted Next.js app.

## Post-wipe requirements

Complete these before running `bootstrap.sh`:

1. Record the accepted host support risk above and prove the installed Docker
   runtime recovers after reboot before production deployment.
2. FileVault and off-Mac recovery-key escrow are confirmed complete.
3. The dedicated non-admin `portals-svc` account exists. Keep a separate admin
   account for maintenance; do not run services as `andresb`.
4. Docker access as the service account remains blocked: the Docker socket is
   owned by `andresb`, and granting access permits broad control of the daemon.
   Settle the runtime ownership model before deployment. VM memory allocation
   and combined service load also remain unverified.
5. Node.js, Pinggy, `grpcurl`, and `jq` are installed. Vercel CLI is also
   installed for operator use. They are in `/Users/Shared/portals-tools`; the
   deployment scripts add their executable paths. Caddy is deployed from its
   pinned Docker Hub image, not as a host binary. AWS CLI credentials are for
   the workstation running the read-only storage probe, not needed by Lore's
   running container.
6. Install the supplied `launchd` jobs in the `portals-svc` user domain. The
   bundled plists deliberately do not run as root. Before release, prove the
   selected local container runtime survives a reboot without an interactive
   session; standard Docker Desktop may require a logged-in user. Do not solve
   that by enabling insecure automatic login—use a runtime that supports this
   requirement or stop the Mac deployment.
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

11. Confirm the host has at least 100 GiB free after the wipe. Reserve space
    for Docker images, Lore cache, logs, and restore evidence; configure
    cleanup before accepting customer traffic.
12. Confirm the Docker VM has enough memory for the actual images. The probe's
    approximately 8 GiB allocation is a starting point, not proof of capacity;
    load-test Lore, Auth, and Caddy together.

## Release acceptance checks

- The selected container runtime survives reboot without an interactive login.
- Auth, Lore, Caddy, and Pinggy start in dependency order.
- Auth HTTP/gRPC and Lore gRPC pass through the public TLS path.
- Lore QUIC passes through the paid Pinggy UDP mapping.
- Certificates match every public hostname and renew successfully.
- Internal health, database, Docker, SSH, and Lore health ports are not
  publicly reachable.
- Pinggy reconnect preserves expected endpoints and ports.
- Full reboot and recovery evidence is captured before onboarding customers.

## Application and security acceptance checks

- ZITADEL OIDC login works without Cognito-only configuration.
- Auth signing-key rotation, refresh-token rotation, and reuse detection pass.
- Lore partitions are the assumed repository authorization boundary. Verify
  every repository RPC denies a tenant-A credential accessing tenant-B data,
  metadata, history, content, or locks; no path-level ACL is required.
- Lore readiness proves authenticated access to S3, DynamoDB, and lock state;
  HTTP liveness alone is insufficient.
- Auth, invitation, and repository access/denial events are written to durable
  append-only audit storage without secrets.

## Recovery drills required before onboarding

- Clean reboot with no interactive login.
- Pinggy disconnect/reconnect with endpoint and certificate verification.
- Lore S3/DynamoDB isolated restore with known content and lock verification.
- Neon restore with migrations and idempotent webhook/job tests.
- DNS/ACME credential replacement and certificate renewal.
- Auth key rotation and old-key retirement.
- Replacement-host rebuild from the release manifest and encrypted recovery
  bundle.

The host is a single availability boundary. A successful drill proves
recoverability, not high availability.

## Documentation checked

- [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/)
- [Docker release notes](https://docs.docker.com/desktop/release-notes/)
- [Apple MacBook Pro model compatibility](https://support.apple.com/en-gb/108052)
- [Apple security releases](https://support.apple.com/en-us/100100)
- [Pinggy CLI](https://pinggy.io/docs/cli/)
- [Pinggy TLS tunnels](https://pinggy.io/docs/tls_tunnels/)
- [Pinggy multiple forwarding](https://pinggy.io/docs/http_tunnels/multi_port_forwarding/)
- [Caddy installation](https://caddyserver.com/docs/install)
- [Apple launchd daemons](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)
- [Apple Platform Security](https://help.apple.com/pdf/security/en_US/apple-platform-security-guide.pdf)

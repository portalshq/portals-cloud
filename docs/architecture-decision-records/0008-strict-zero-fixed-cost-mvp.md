# ADR 0008: Strict zero-fixed-cost MVP architecture

- Status: Proposed — do not label as generally available production until the
  validation gates pass
- Date: 2026-09-21
- Scope: an initial cohort of fewer than 100 customers

## Decision

Run the smallest architecture that preserves the Lore product protocol and
keeps all **recurring infrastructure** inside published free allowances.  This
is a single-host, non-HA MVP.  It is not a promise that domains, payment fees,
customer CRM subscriptions, or provider overages are free.

| Capability | Placement | Why it exists |
|---|---|---|
| Lore server | OCI Always Free A1 host | Core CLI collaboration.  Keep native gRPC and QUIC; do not replace it with HTTP. |
| Lore durable state | Encrypted OCI block volume, backed up to OCI Object Storage | Lore needs durable local state.  Exactly one Lore process owns it. |
| Auth Gateway | Same OCI host, loopback-only except its browser callback/JWKS routes through Caddy | Lore needs its token, JWKS, API-key, and ReBAC contracts.  It remains a logical service, not a separate VM. |
| Identity provider | Keycloak on the same host | Stable, self-hosted OIDC authorization-code provider.  It removes AWS Cognito and does not rely on Supabase's currently-beta OAuth server. |
| Platform database | PostgreSQL on the same host, loopback-only, on the encrypted OCI volume | Holds Keycloak, accounts, pilots, memberships, invitations, billing state, consent, audit, and Auth Gateway state.  A managed platform database is not required for the first cohort. |
| Product BFF | Existing Next.js application on the same host | Absorbs the standalone Backend and Invitation APIs after their routes and tests are migrated. |
| CRM delivery | A bounded worker inside the BFF deployment, with an event-first attempt and a 30-minute recovery sweep | Avoids another always-on service while preserving eventual delivery. |
| Leads and CRM system of record | Existing Neon project only | Preserve the existing working database.  Do not create a second Neon project merely to multiply a free allowance. |
| Secrets | OCI Vault | Store database, Keycloak, Auth Gateway signing, encryption, CRM, and mail credentials. |
| Edge and DNS | Cloudflare Free, DNS-only | Public DNS.  Caddy, not Cloudflare, terminates TLS because Lore requires direct TCP and UDP. |
| HTTPS certificates | Caddy with Let's Encrypt | TLS for app, identity, and direct Lore endpoints. |
| Transactional mail | Resend Free through SMTP/API | Invitation and identity messages.  Do not use AWS SES. |
| Backups, logs, and alerts | OCI Object Storage, Logging, Monitoring, and Notifications | Required recovery evidence and bounded alerting without a paid observability service. |

## Explicit removals

- AWS, including Cognito, ECS, EC2, ALB, NAT, RDS, WAF, KMS, Secrets Manager,
  CloudTrail, ECR, and SES.
- Service Connect, Envoy, private-subnet/NAT topology, and separate container
  orchestration.
- ControlPlaneService, standalone BackendService, and standalone
  InvitationService at runtime.  Their required product behavior must first
  live in and be tested through the BFF/Auth Gateway boundary.
- Supabase.  It is not rejected generally; it is excluded here because a
  separate free project adds a provider, may pause after low activity, and its
  OAuth server is currently beta.  It does not reduce the number of required
  runtime components in this MVP.

## Host boundary

The only public ports are `443/TCP`, Lore `41337/TCP`, and Lore `41337/UDP`.
The host firewall drops all other inbound traffic.  PostgreSQL, Keycloak
management, Lore health, Auth ReBAC, and other internal APIs bind to loopback
or the private container network only.  There is no public SSH; administration
uses OCI console connection or OCI Bastion.  TLS is mandatory from the host to
Neon and Resend, and for all browser and Lore connections.

The host must use explicit memory limits and systemd restart policies.  No
deployment proceeds until an ARM64 Lore server, Auth Gateway, Keycloak,
PostgreSQL, Next BFF, and Caddy pass a measured load and memory canary on the
actual OCI A1 shape.  Keycloak's published small-production recommendation is
2 GiB, so it is not assumed to fit without that measurement.

## Strict budget ceilings

| Provider resource | Release ceiling |
|---|---|
| OCI A1 compute | At most 2 OCPUs and 12 GB aggregate in the home region. |
| OCI block volume | At most 200 GB aggregate; leave 20% free space on the volume. |
| OCI Object Storage | At most 16 GB stored and 40,000 requests/month, leaving safety margin below the published free limit. |
| OCI Logging | At most 8 GB/month. |
| OCI outbound data | At most 8 TB/month. |
| Neon | At most 70 CU-hours, 350 MB stored, and 3.5 GB public transfer/month. |
| Resend | At most 80 emails/day and 2,400 emails/month. |
| Payments | Stripe remains disabled for the free cohort.  Enabling a charge accepts transaction fees and ends the literal zero-spend claim. |

The actual dashboards, not code defaults, are the release authority.  Any
provider requiring a paid subscription, payment method with automatic overage,
or a resource not shown as free in its own cost estimate blocks release.

## Recovery and product limits

This is intentionally single-node.  A host loss interrupts Lore, login, the
app, and the platform database together.  A replacement requires restoring the
volume or PostgreSQL dump and Keycloak/Auth secrets before service returns.
The following must pass on an isolated canary before onboarding customers:

1. Restore a PostgreSQL dump and verify Keycloak login, membership, invitation,
   and Auth Gateway token issuance.
2. Restore Lore volume data and prove repository identity, revisions, a known
   content hash, and authorization.
3. Replace the OCI host and record end-to-end recovery time.
4. Restore the Neon leads/CRM branch and verify idempotent CRM delivery.
5. Prove public exposure is limited to the three stated ports and that direct
   database, ReBAC, management, and health ports fail externally.

## Consequences

- This design is the minimum-cost functional MVP, not high availability.
- A public branded domain still has registrar cost.  A free wildcard or an IP
  address is not an acceptable production identity or TLS substitute.
- A direct public Lore UDP endpoint cannot receive Cloudflare's ordinary HTTP
  WAF protection.  Host firewall limits, authentication, rate limits, bounded
  process resources, patching, and logs are mandatory compensating controls.
- OCI may reclaim an idle Always Free host and may not have A1 capacity when a
  replacement is needed.  This is an accepted availability risk, not a defect
  hidden by the word "free".

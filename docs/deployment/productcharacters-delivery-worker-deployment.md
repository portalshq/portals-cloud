# ProductCharacters delivery-worker deployment path

This is a separate deployment from Portals. The shared worker scaffold is in
[`services/delivery-worker`](../../services/delivery-worker/README.md); it does
not make Portals the owner of ProductCharacters jobs, payment events, or
customer workflow. Do not add the worker to Portals' required Compose stack or
release gate.

## Current status: not ready for customer delivery

The container can build and its health, signed-wake, replay, lease, and package
helpers have tests. Delivery execution is intentionally disabled by default.
The ProductCharacters-owned job schema/migrations and webhook integration are
not present here, and the Lore remote adapter is not verified. `WORKER_ENABLE_DELIVERY=true`
must remain off until all gates below pass; a healthy process is not evidence
that a paid delivery can complete.

## Target deployment boundary

```text
ProductCharacters webhook / scheduler
            │ signed, idempotent wake
            ▼
Pinggy TLS → Caddy (exact worker host + wake route) → worker :8090
                                                   ├─ ProductCharacters Neon role/schema
                                                   └─ Lore public gRPC + scoped machine identity
```

Keep the worker out of Portals' public application route and separate from the
Portals Mac Compose file. Expose only the signed wake route through a dedicated
ProductCharacters hostname; keep `/health`, `/ready`, Postgres, Docker, and
Lore internal ports private. Use the existing persistent Pinggy TLS mapping
and Caddy only if Pinggy confirms that the custom hostname/SNI can be routed
alongside the existing Portals hostnames. Otherwise provision a separate
mapping and document its cost. Do not assume an extra mapping is included in
the current seat.

## Release and deployment sequence

1. ProductCharacters owns and merges the job schema, Stripe/event idempotency,
   webhook integration, tenant/account authorization, package retention, and
   operator/manual-review behavior. Apply migrations before starting a worker.
2. Complete the verified remote Lore adapter. Prove the worker's machine
   credential can access only its assigned repository/partition and cannot
   access another tenant. Keep `WORKER_ENABLE_DELIVERY=false` until the entire
   integration passes.
3. Build from the reviewed `services/delivery-worker` source and publish an
   immutable Docker Hub image (proposed repository:
   `portalshq/productcharacters-delivery-worker`). Publish `linux/amd64` for
   this Intel Mac and `linux/arm64` if the same release must support Apple
   Silicon. Generate SBOM and provenance, sign the digest, scan it, and record
   the source commit, platforms, digest, and verification receipt. Never deploy
   a mutable tag. Confirm the ProductCharacters Docker Hub repository and
   namespace permissions before enabling publication.
4. Deploy it as a separate Compose project/configuration with a dedicated
   environment file, least-privilege Neon role/schema, worker-only Lore
   credential, distinct wake secret, bounded resources, read-only root
   filesystem where compatible, dropped Linux capabilities, `no-new-privileges`,
   and a bounded temporary workspace. Do not provide Stripe credentials or
   Portals/Auth database credentials to the worker.
5. Route the exact wake path through Caddy and Pinggy only after local
   readiness succeeds. Validate signature, freshness, replay rejection,
   duplicate webhook delivery, rate limiting, and that the wake request cannot
   create/authorize a job. The worker claims only jobs created by the
   ProductCharacters-owned flow.
6. In staging, test success, retry, expired lease, manual review, repository
   conflict, package hash mismatch, cross-tenant denial, graceful shutdown,
   process restart, host reboot, and Neon/Lore recovery. Check that logs and
   audit events contain no tokens, payment secrets, or package content.
7. Enable delivery in production only after the ProductCharacters owner signs
   off on the release digest, migration, isolation tests, and restore evidence.

## Host isolation caveat

The current Mac has one Docker Desktop daemon. Access to that daemon is broad
host-control authority; separate Compose projects and container users do not
create a strong boundary between Portals and ProductCharacters. If either
product needs a hard administrative or hostile-workload boundary, use a
separate host/VM and Docker daemon. Sharing this Mac is an explicit
single-operator MVP trade-off, not equivalent isolation.

## Known implementation gates

- The worker README says ProductCharacters must supply the real job schema and
  webhook integration; no deployment should invent those contracts.
- The Lore adapter currently fails closed when delivery is enabled.
- Container binding now uses `WORKER_BIND_ADDRESS`: the image listens on its
  container interface so a proxy can reach it; non-container runs default to
  loopback. The deployment must still avoid publishing `8090` on a public host
  interface and verify access only through the intended proxy.
- The Dockerfile now uses lockfile-enforced `npm ci`; prove a clean image build
  with the checked-in lockfile before publishing.
- There is no verified Docker Hub worker digest/receipt or separate production
  Compose/deploy config yet. These are release-preparation work, not evidence
  of a deployed ProductCharacters worker.

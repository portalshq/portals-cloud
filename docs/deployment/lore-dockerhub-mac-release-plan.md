# Lore `.10` Docker Hub and Mac production release plan

Status: **implemented; unpublished and unverified**

This plan releases the already-approved Lore `v0.8.4-portals.10` source as an
immutable Docker Hub image for the Intel Mac deployment. It does not create a
new Lore source release and does not modify Lore `prod.toml`.

## Decisions

- Lore source: `f717f97c7efffb53674d6c10cae94bd994b0c7e9` (`v0.8.4-portals.10`).
- Registry: Docker Hub `portalshq/lore` for the Mac Lore path only.
- Target: `linux/amd64`; ARM64 is optional future support, not an MVP gate.
- Signing: Cosign keyless/OIDC in GitHub Actions.
- Cloud/ECR publishing remains unchanged until separately migrated.
- Lore QUIC is enabled by runtime environment variables and mounted certificates.

## Release implementation

### Docker Hub publisher

Add a publisher separate from the existing ECR publisher. It must:

- Refuse dirty Lore or packaging inputs.
- Build and push an AMD64 base image and derived Lore server image.
- Use unique intermediate tags only; production references use digests.
- Bind OCI labels and provenance to the Lore source commit, packaging commit,
  and build identifier.
- Publish SBOM and provenance attestations.
- Verify the image reports `0.8.4-portals.10`.
- Resolve and print the final `repository@sha256:<digest>`.

The AMD64 path should not install or compile the unused ARM cross-toolchain.
The existing multi-architecture ECR path is left intact.

### GitHub Actions publication

Add a Docker Hub workflow triggered by a reviewed release tag or explicit
manual dispatch. It uses Docker Hub secrets, builds `linux/amd64`, publishes
SBOM/provenance, signs the final digest with keyless Cosign/OIDC, verifies the
workflow identity, and runs Trivy against the immutable digest.

The workflow must export the digest, platform, source/packaging commits,
signature, attestation, and scan evidence. It must not require AWS credentials
or update production metadata from a mutable tag.

### Docker Hub promotion and receipt

Add a registry-neutral promotion validator rather than reusing the ECR-specific
validator. It must verify the immutable digest, AMD64 runnable manifest, SBOM,
provenance, source/packaging commit binding, keyless signature, Trivy policy,
embedded Lore version, and Docker Hub repository identity.

The receipt records the index and platform digests, base-image digest, source
and packaging commits, build identifier, signature identity/bundle, SBOM and
provenance references, scan completion time, and scanner version.

### Release BOM

Extend `infra/lore/versions.yaml` so the Mac release records the Docker Hub
immutable Lore image, base image, `linux/amd64` platform, source commit,
packaging commit, security contract, and receipt. Preserve existing ECR fields
for the legacy/cloud path. Promotion scripts, not manual edits, write digests
and receipts.

## Runtime and Mac deployment

Lore runtime configuration must contain:

```text
LORE__SERVER__QUIC__ENABLED=true
LORE__SERVER__QUIC__VERIFY_CLIENT_CERTS=false
LORE__SERVER__QUIC__CERTIFICATE__CERT_FILE=/run/secrets/lore-quic/fullchain.pem
LORE__SERVER__QUIC__CERTIFICATE__PKEY_FILE=/run/secrets/lore-quic/privkey.pem
```

Compose must bind Lore TCP/UDP `41337` and health `41339` to loopback only,
mount the QUIC certificate directory read-only, and treat `/data` as a
disposable cache. Certificates must be persistent, publicly trusted, DNS-01
issued, valid for the Pinggy QUIC hostname, and renewal-tested.

Update Mac release validation to require AMD64 rather than both architectures.
It must reject mutable tags, ARM64-only images, missing attestations, wrong
registry/repository, and wrong embedded versions. Resolve the current checker
reference to `lore-sdk.version` if that BOM entry is absent.

The deployment sequence is Auth → readiness/JWKS → Lore/storage readiness →
worker → Caddy → Pinggy. External acceptance must cover TLS certificates,
HTTP/2/gRPC, Lore UDP/QUIC, signed worker wake, loopback-only health/internal
ports, and cross-repository denial.

## Production prerequisites and blockers

- Pinggy must support concurrent persistent TLS/TCP and UDP mappings,
  HTTP/2/SNI, custom domains, and reconnect stability.
- DNS-01 certificates must issue, renew, and reload successfully.
- Mac Auth must use the accepted provider-neutral/ZITADEL and sealed-file
  configuration rather than the current Cognito/KMS/Secrets Manager-only path.
- Auth signing keys and API-key pepper require read-only sealed files and
  overlapping key rotation.
- Neon schema, role, TLS, migrations, allowance, and restore evidence must
  exist.
- Lore requires the exact S3 **and** DynamoDB resources for the pinned release,
  with least-privilege IAM, versioning/PITR, and isolated restore evidence.
- Cross-tenant authorization must be enforced for every repository RPC and
  produce denial audit records.
- Auth, Lore, repository, lock, webhook, and billing audit events must be
  durable, correlated, redacted, and exported off-host.
- Reboot, tunnel reconnect, host loss, Lore restore, Neon restore, DNS recovery,
  and Auth key-rotation drills must pass before onboarding users.

AWS credentials are not required to publish the Docker Hub image. They remain
required at runtime for Lore's S3/DynamoDB storage access.

## Acceptance tests

### Build and supply chain

- Clean-source enforcement passes.
- AMD64 build succeeds on the remote AMD64 builder without QEMU.
- Image version is `0.8.4-portals.10`.
- SBOM and provenance decode successfully.
- Base and server images are digest-pinned.
- Trivy has no unresolved critical/high findings.
- Keyless Cosign verification succeeds for the exact digest.

### Metadata

- BOM source commit equals `f717f97...`.
- Image and base image are Docker Hub immutable digests.
- Platform is `linux/amd64`.
- Receipt binds image, source, packaging commit, signature, scan, and
  attestations.
- No mutable tag appears in deployment configuration.

### Runtime

- QUIC starts only with the mounted certificate and key.
- Wrong or missing certificates fail closed.
- Caddy does not expose Auth internal/ReBAC, Lore health, Docker, or database
  ports.
- Auth-to-Lore ReBAC and Lore-to-S3/DynamoDB readiness pass.
- Cross-tenant repository access is denied without side effects.
- Signed worker wake accepts valid requests and rejects replay, stale, malformed,
  and invalid signatures.

## Known current state

- Lore `.10` source and CLI release are already approved.
- The prior local Docker Hub build was canceled during cold Rust compilation.
- No Docker Hub image digest or promotion receipt exists yet.
- Current image promotion and documentation are still primarily ECR-oriented.
- Mac image validation now requires immutable AMD64 images and the promoted
  Docker Hub Lore receipt; deployment remains blocked until that receipt exists.

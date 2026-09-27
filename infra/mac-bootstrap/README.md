# Mac production bootstrap

The Intel host probe and post-wipe checklist are recorded in
[HOST_PREP.md](HOST_PREP.md). The local deployment target is `linux/amd64`;
ARM64 is only an optional future artifact.

This module manages the Mac runtime boundary only. Next.js remains on Vercel.

Before running `deploy.sh`, provide a private release environment file with
immutable image digests and readable, service-owned environment files:

```text
AUTH_GATEWAY_IMAGE_DIGEST=registry.example/auth-gateway@sha256:<64 hex chars>
LORE_IMAGE_DIGEST=portalshq/lore@sha256:<64 hex chars>
DELIVERY_WORKER_IMAGE_DIGEST=registry.example/delivery-worker@sha256:<64 hex chars>
CADDY_IMAGE_DIGEST=caddy@sha256:<64 hex chars>
AUTH_ENV_FILE=/private/path/auth.env
LORE_ENV_FILE=/private/path/lore.env
WORKER_ENV_FILE=/private/path/worker.env
CADDY_ENV_FILE=/private/path/caddy.env
CADDY_CERT_DIR=/private/path/dns01-issued-caddy-certs
LORE_QUIC_CERT_DIR=/private/path/dns01-issued-lore-quic-certs
```

Lore QUIC is enabled at runtime; it is not enabled by the image's production
TOML. Add these entries to `LORE_ENV_FILE` and keep the certificate directory
separate from Caddy's unless the certificate owner and permissions are
explicitly shared:

```text
LORE__SERVER__QUIC__ENABLED=true
LORE__SERVER__QUIC__VERIFY_CLIENT_CERTS=false
LORE__SERVER__QUIC__CERTIFICATE__CERT_FILE=/run/secrets/lore-quic/fullchain.pem
LORE__SERVER__QUIC__CERTIFICATE__PKEY_FILE=/run/secrets/lore-quic/privkey.pem
```

The certificate must be persistent, publicly trusted, match the Pinggy QUIC
hostname, and be renewed before expiry. `check-release.mjs` requires both PEM
files before deployment.

The worker environment must include `LORE_SDK_VERSION` matching the
`lore-sdk.version` entry in `infra/lore/versions.yaml`. The release checker
fails closed if the worker image is not configured with the BOM pin.

The Caddy environment file must also define `AUTH_DOMAIN`, `LORE_DOMAIN`, and
`WORKER_DOMAIN`; the template intentionally contains no production hostname.

Auth production mode should use read-only sealed files rather than embedding
secrets in the environment. Set `JWT_SIGNING_PROVIDER=sealed-file` with
`JWT_LOCAL_PRIVATE_KEY_PATH`, and set `API_KEY_PEPPER_PROVIDER=sealed-file`
with `API_KEY_PEPPER_FILE_PATH`. Mount both files read-only into the Auth
container and keep them owned by the service account. The base64 pepper
variable remains only for disposable development environments.

The release checker deliberately fails when values are missing, images are
mutable, or Next.js is added to the Mac Compose stack. It does not provision
DNS, Pinggy, AWS storage, Neon, or secrets.

Before deployment, run `scripts/check-images.sh` with the release digest
environment. It queries the registry and requires every Auth, Lore, worker,
and Caddy image to provide `linux/amd64`. Lore must be pinned to an immutable
`portalshq/lore@sha256:...` reference.

The Lore `/data` volume is only a local cache/workspace. S3 plus DynamoDB are
the production source of truth; the cache must be disposable and excluded from
backup claims.

The Pulumi program emits only the non-secret release manifest. Configure these
Pulumi keys before `pulumi preview`:

```text
authGatewayImageDigest
loreImageDigest
deliveryWorkerImageDigest
caddyImageDigest
authDomain
loreDomain
workerDomain
loreQuicDomain
```

It does not create cloud resources or upload secrets; those operations remain
explicit deployment steps.

Run `scripts/backup.sh` with an off-Mac destination and a separately protected
key file. It copies only JSON/YAML recovery manifests, encrypts the bundle,
and writes a SHA-256 sidecar. Service env files and secret directories are
never included.

The launchd plists call `scripts/run-service.sh`, which gates Lore on Auth,
the worker on Lore, Caddy on worker readiness, and Pinggy on Caddy’s loopback
listener. This prevents reboot races from publishing a partially started
stack. Each plist writes stdout and stderr under
`~/Library/Logs/portals-*.{log,err.log}` for recovery evidence.

After `deploy.sh`, run `scripts/check-external.sh` with the configured public
domains, worker URL, and Lore QUIC host/port. This is the required external
TLS, gRPC, health, UDP, and signed-worker-wake acceptance probe; local
container health alone is not a production approval. Set `WAKE_SECRET`,
`WAKE_ID`, `WAKE_TIMESTAMP`, and `WAKE_BODY` to a fresh test wake payload.

The probe requires `AUTH_DOMAIN`, `LORE_DOMAIN`, `WORKER_URL`,
`LORE_QUIC_HOST`, and `LORE_QUIC_PORT` as well. The worker’s health and
readiness endpoints remain loopback-only; its public check is the signed wake
request. Use a fresh `WAKE_ID` and a current timestamp; never reuse a
production wake payload. The probe also validates the presented certificate
against each Auth and Lore hostname.

#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
digest=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

printf '%s\n' \
  '#!/bin/sh' \
  'if [ "$1" = buildx ] && [ "$2" = version ]; then exit 0; fi' \
  'if [ "$1" = buildx ] && [ "$2" = imagetools ] && [ "$3" = inspect ]; then' \
  '  case "$4" in' \
  "    *arm-only*) printf '%s\\n' 'Platform: linux/arm64' ;;" \
  "    *) printf '%s\\n' 'Platform: linux/amd64' ;;" \
  '  esac' \
  '  exit 0' \
  'fi' \
  'exit 1' > "$tmp/docker"
chmod +x "$tmp/docker"

run_check() {
  PATH="$tmp:$PATH" \
  AUTH_GATEWAY_IMAGE_DIGEST="portalshq/auth-gateway@sha256:$digest" \
  LORE_IMAGE_DIGEST="portalshq/lore@sha256:$digest" \
  CADDY_IMAGE_DIGEST="caddy@sha256:$digest" \
  "$ROOT/scripts/check-images.sh"
}

grep -q 'uname -m)" = x86_64' "$ROOT/scripts/bootstrap.sh"
grep -q '"mac-amd64"' "$ROOT/scripts/recover.sh"
grep -q "architecture: 'mac-amd64'" "$ROOT/index.ts"
grep -q 'LORE_IMAGE_DIGEST must match lore.image' "$ROOT/scripts/check-release.mjs"
grep -q 'AUTH_GATEWAY_IMAGE_DIGEST must match the Docker Hub control-plane.image' "$ROOT/scripts/check-release.mjs"
if grep -E 'ecr-login|dkr\.ecr|aws ecr' "$ROOT/scripts/check-images.sh" "$ROOT/scripts/run-service.sh" "$ROOT/scripts/bootstrap.sh"; then
  echo 'Mac image pulls must not depend on ECR' >&2
  exit 1
fi
grep -q 'AUTH_SECRET_DIR' "$ROOT/templates/compose.prod.yaml"
grep -q 'AUTH_DB_TLS_DIR' "$ROOT/templates/compose.prod.yaml"
grep -q 'LORE_AWS_ENV_FILE' "$ROOT/templates/compose.prod.yaml"
grep -q 'LORE_AWS_ENV_FILE' "$ROOT/scripts/bootstrap.sh"
grep -q 'RELAY_WIREGUARD_IP' "$ROOT/templates/compose.prod.yaml"
grep -q 'POSTGRES_TLS_DIR' "$ROOT/templates/compose.prod.yaml"
grep -q 'RELAY_WIREGUARD_IP:?RELAY_WIREGUARD_IP is required}:5432:5432' "$ROOT/templates/compose.prod.yaml"
grep -q 'POSTGRES_IMAGE_DIGEST' "$ROOT/templates/release.env.example"
grep -q 'compose up -d --wait postgres' "$ROOT/scripts/deploy.sh"
grep -q 'clientcert=verify-full' "$ROOT/scripts/provision-postgres-mtls.sh"
grep -q 'local all channels_app trust' "$ROOT/scripts/provision-postgres-mtls.sh"
grep -q 'PostgreSQL container UID 999 cannot read TLS material' "$ROOT/scripts/bootstrap.sh"
grep -q 'POSTGRES_RELAY_RELEASE=ready' "$ROOT/scripts/install-postgres-relay-release.sh"
grep -q 'PostgreSQL release archive checksum mismatch' "$ROOT/scripts/activate-postgres-relay-release.sh"
grep -q 'AUTH_LOCAL_POSTGRES_CUTOVER=ready' "$ROOT/scripts/cutover-auth-to-local-postgres.sh"
grep -q 'ALTER SCHEMA public OWNER TO auth_gateway' "$ROOT/scripts/cutover-auth-to-local-postgres.sh"
grep -q 'AUTH_DB_TLS_DIR=/Users/portals-svc/secrets/auth-db-tls' "$ROOT/scripts/install-auth-local-postgres-cutover.sh"
grep -q 'Auth cutover archive checksum mismatch' "$ROOT/scripts/activate-auth-local-postgres-cutover.sh"
grep -q 'Auth schema repair checksum mismatch' "$ROOT/scripts/repair-auth-schema-permissions.sh"
grep -q 'ssl_min_protocol_version=TLSv1.3' "$ROOT/templates/compose.prod.yaml"
grep -q 'AWS_REGION belongs only in LORE_ENV_FILE' "$ROOT/scripts/check-release.mjs"
grep -q 'LC_ALL=C' "$ROOT/scripts/deploy.sh"
grep -q "grep -v '^AWS_REGION='" "$ROOT/scripts/apply-wireguard-relay-bindings.sh"
grep -q '/.well-known/jwks.json' "$ROOT/templates/Caddyfile"
grep -q '8085/healthz' "$ROOT/scripts/deploy.sh"
grep -q 'Docker-neighbor ReBAC URL' "$ROOT/scripts/check-release.mjs"
if grep -Eq 'delivery-worker|WORKER_' "$ROOT/templates/compose.prod.yaml" "$ROOT/templates/Caddyfile" "$ROOT/scripts/bootstrap.sh" "$ROOT/scripts/deploy.sh" "$ROOT/scripts/check-images.sh" "$ROOT/index.ts"; then
  echo 'The Portals Mac release must not require the ProductCharacters worker' >&2
  exit 1
fi
run_check

if PATH="$tmp:$PATH" AUTH_GATEWAY_IMAGE_DIGEST="portalshq/arm-only@sha256:$digest" LORE_IMAGE_DIGEST="portalshq/lore@sha256:$digest" CADDY_IMAGE_DIGEST="caddy@sha256:$digest" "$ROOT/scripts/check-images.sh"; then
  echo 'ARM64-only images must be rejected' >&2
  exit 1
fi

if PATH="$tmp:$PATH" AUTH_GATEWAY_IMAGE_DIGEST="portalshq/auth-gateway@sha256:$digest" LORE_IMAGE_DIGEST=portalshq/lore:latest CADDY_IMAGE_DIGEST="caddy@sha256:$digest" "$ROOT/scripts/check-images.sh"; then
  echo 'Mutable Lore images must be rejected' >&2
  exit 1
fi

if PATH="$tmp:$PATH" AUTH_GATEWAY_IMAGE_DIGEST="portalshq/auth-gateway@sha256:$digest" LORE_IMAGE_DIGEST="portalshq/other-lore@sha256:$digest" CADDY_IMAGE_DIGEST="caddy@sha256:$digest" "$ROOT/scripts/check-images.sh"; then
  echo 'Wrong Lore registry must be rejected' >&2
  exit 1
fi

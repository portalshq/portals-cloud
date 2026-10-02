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

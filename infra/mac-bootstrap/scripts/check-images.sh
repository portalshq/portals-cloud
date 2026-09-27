#!/bin/sh
set -eu

command -v docker >/dev/null || { echo 'docker is required' >&2; exit 1; }
command -v docker >/dev/null && docker buildx version >/dev/null 2>&1 || { echo 'docker buildx is required' >&2; exit 1; }

for name in AUTH_GATEWAY_IMAGE_DIGEST LORE_IMAGE_DIGEST DELIVERY_WORKER_IMAGE_DIGEST CADDY_IMAGE_DIGEST; do
  eval "image=\${$name:-}"
  test -n "$image" || { echo "$name is required" >&2; exit 1; }
  printf '%s\n' "$image" | grep -Eq '^[^@[:space:]]+@sha256:[0-9a-f]{64}$' || { echo "$name must be an immutable sha256 image digest" >&2; exit 1; }
  if [ "$name" = LORE_IMAGE_DIGEST ]; then
    case "$image" in
      portalshq/lore@sha256:*) ;;
      *) echo 'LORE_IMAGE_DIGEST must use portalshq/lore' >&2; exit 1 ;;
    esac
  fi
  platforms=$(docker buildx imagetools inspect "$image" 2>/dev/null) || { echo "Unable to inspect $name" >&2; exit 1; }
  printf '%s\n' "$platforms" | grep -q 'linux/amd64' || { echo "$name lacks linux/amd64" >&2; exit 1; }
done
echo 'All release images provide linux/amd64'

#!/usr/bin/env bash
# Build the Control Plane Docker image, push it to Docker Hub, and record the
# new image in infra/lore/versions.yaml (the version Pulumi deploys).
#
# Usage:
#   ./scripts/publish-image.sh
#
# Optional env vars:
#   HUB_IMAGE   Image namespace/name (default: portalshq/control-plane)
#
# Requires docker login to Docker Hub. Public images are pulled by ECS with no
# extra auth.
#
# After this succeeds, deploy the new version with:
#   cd infra/pulumi && pulumi up -s dev
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VERSIONS_FILE="$ROOT/infra/lore/versions.yaml"

HUB_IMAGE="${HUB_IMAGE:-portalshq/control-plane}"

SHORT_SHA="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo local)"
TAG="${SHORT_SHA}-$(date +%Y%m%d-%H%M%S)"
IMAGE_URI="${HUB_IMAGE}:${TAG}"

echo "==> Building control-plane image"
echo "    Image: ${IMAGE_URI}"

docker build \
    -t "$IMAGE_URI" \
    -f "$ROOT/docker/control-plane/Dockerfile" \
    "$ROOT"

echo ""
echo "==> Pushing ${IMAGE_URI}"
docker push "$IMAGE_URI"

DIGEST="$(docker inspect --format '{{index .RepoDigests 0}}' "$IMAGE_URI" 2>/dev/null || echo unknown)"

echo ""
echo "==> Recording version in ${VERSIONS_FILE}"
awk -v image="$IMAGE_URI" '
    $0 ~ /^control-plane:/ { in_cp = 1 }
    in_cp && /^  image:/ { sub(/^  image:.*/, "  image: \"" image "\""); in_cp = 0 }
    { print }
' "$VERSIONS_FILE" > "$VERSIONS_FILE.tmp" && mv "$VERSIONS_FILE.tmp" "$VERSIONS_FILE"

echo ""
echo "==> Done"
echo "    Image:  ${IMAGE_URI}"
echo "    Digest: ${DIGEST}"
echo ""
echo "    Deploy with:"
echo "      cd infra/pulumi && pulumi up -s dev"

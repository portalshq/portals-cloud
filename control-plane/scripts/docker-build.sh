#!/usr/bin/env bash
# Build the Docker image.
# Usage: ./scripts/docker-build.sh [tag]
set -euo pipefail
cd "$(dirname "$0")/../.."

TAG="${1:-lorecloud-control-plane:latest}"

echo "==> Building Docker image: $TAG"
docker build \
    -t "$TAG" \
    -f docker/control-plane/Dockerfile \
    .

echo ""
echo "==> Image built: $TAG"
echo "    Run: docker run --env-file .env.local -p 8083:8083 $TAG"

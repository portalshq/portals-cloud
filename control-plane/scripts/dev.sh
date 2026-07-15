#!/usr/bin/env bash
# Start the local dev environment and run the control plane.
# Usage: ./scripts/dev.sh
set -euo pipefail
cd "$(dirname "$0")/.."

CARGO="${CARGO:-cargo +1.97.0-aarch64-apple-darwin}"

# Start Postgres, MinIO, and Redis if not running
echo "==> Ensuring infrastructure is running..."
cd ..
docker compose --env-file .env.local up -d postgres minio minio-init redis 2>&1 || true
cd control-plane

# Copy .env if not present
if [ ! -f .env ]; then
    echo "==> No .env found, copying from .env.local"
    cp .env.local .env
fi

echo "==> Waiting for Postgres..."
for i in $(seq 1 30); do
    if docker compose exec -T postgres pg_isready -U lago > /dev/null 2>&1; then
        echo "    Postgres ready."
        break
    fi
    sleep 1
done

echo "==> Waiting for Redis..."
for i in $(seq 1 30); do
    if docker compose exec -T redis redis-cli ping > /dev/null 2>&1; then
        echo "    Redis ready."
        break
    fi
    sleep 1
done

echo "==> Starting control plane..."
$CARGO run --bin lorecloud-control-plane

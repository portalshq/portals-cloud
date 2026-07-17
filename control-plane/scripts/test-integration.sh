#!/usr/bin/env bash
# Run integration tests (uses MockStateStore, no external infrastructure required).
# Usage: ./scripts/test-integration.sh
set -euo pipefail
cd "$(dirname "$0")/.."

CARGO="${CARGO:-cargo +1.97.0-aarch64-apple-darwin}"

echo "==> Running integration tests..."
$CARGO test --package control-plane-tests --lib control-plane-tests::integration

echo ""
echo "==> Integration tests passed."

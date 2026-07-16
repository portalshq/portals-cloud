#!/usr/bin/env bash
# Run unit tests only (no external dependencies required).
# Usage: ./scripts/test-unit.sh
set -euo pipefail
cd "$(dirname "$0")/.."

CARGO="${CARGO:-cargo +1.97.0-aarch64-apple-darwin}"

echo "==> Running unit tests..."
$CARGO test --lib control-plane-tests::unit

echo ""
echo "==> Unit tests passed."

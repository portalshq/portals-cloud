#!/usr/bin/env bash
# Run all unit and integration tests (no external deps required).
# Usage: ./scripts/test.sh
set -euo pipefail
cd "$(dirname "$0")/.."

CARGO="${CARGO:-cargo +1.97.0-aarch64-apple-darwin}"

echo "==> Running tests..."
$CARGO test 2>&1

echo ""
echo "==> All tests passed."

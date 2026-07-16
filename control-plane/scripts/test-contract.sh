#!/usr/bin/env bash
# Run contract tests (verifies provider implementations match trait contracts).
# Usage: ./scripts/test-contract.sh
set -euo pipefail
cd "$(dirname "$0")/.."

CARGO="${CARGO:-cargo +1.97.0-aarch64-apple-darwin}"

echo "==> Running contract tests..."
$CARGO test --lib control-plane-tests::contract

echo ""
echo "==> Contract tests passed."

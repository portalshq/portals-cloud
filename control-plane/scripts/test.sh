#!/usr/bin/env bash
# Run all unit, integration, and contract tests (no external deps required).
# Usage: ./scripts/test.sh
set -euo pipefail
cd "$(dirname "$0")/.."

CARGO="${CARGO:-cargo +1.97.0-aarch64-apple-darwin}"

echo "==> Running unit tests..."
$CARGO test --lib control-plane-tests::unit

echo ""
echo "==> Running integration tests..."
$CARGO test --lib control-plane-tests::integration

echo ""
echo "==> Running contract tests..."
$CARGO test --lib control-plane-tests::contract

echo ""
echo "==> All tests passed."
echo ""
echo "Note: E2E tests require docker-compose infrastructure."
echo "Run with: ./scripts/test-e2e.sh (when implemented)"

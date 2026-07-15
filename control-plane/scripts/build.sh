#!/usr/bin/env bash
# Build the release binary.
# Usage: ./scripts/build.sh
set -euo pipefail
cd "$(dirname "$0")/.."

CARGO="${CARGO:-cargo +1.97.0-aarch64-apple-darwin}"

echo "==> Building release binary..."
$CARGO build --release --bin lorecloud-control-plane 2>&1

echo ""
echo "==> Binary at: target/release/lorecloud-control-plane"

#!/usr/bin/env bash
# Generate a new Ed25519 signing key for data plane tokens.
# Usage: ./scripts/generate-key.sh
set -euo pipefail

KEY=$(openssl rand -base64 32)
echo "Generated ED25519_SIGNING_KEY:"
echo "$KEY"
echo ""
echo "Add to your .env file:"
echo "  ED25519_SIGNING_KEY=$KEY"

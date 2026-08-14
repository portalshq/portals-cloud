#!/usr/bin/env bash
# Compatibility entry point: the active production control plane is the Auth
# Gateway. The legacy caller-selected-claims issuer must never be published.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec "${ROOT}/control-plane/scripts/publish-auth-gateway.sh" "$@"

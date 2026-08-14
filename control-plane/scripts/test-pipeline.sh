#!/usr/bin/env bash
# Hermetic regression checks for release publication and promotion.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
fail() { echo "FAIL: $*" >&2; exit 1; }

bash -n "${ROOT}/control-plane/scripts/publish-image.sh"
bash -n "${ROOT}/control-plane/scripts/publish-auth-gateway.sh"
bash -n "${ROOT}/infra/lore/scripts/docker-buildx-lore.sh"
bash -n "${ROOT}/infra/pulumi/scripts/verify-and-promote-image.sh"

grep -q 'publish-auth-gateway.sh' "${ROOT}/control-plane/scripts/publish-image.sh" \
  || fail "legacy publish entry point does not delegate to the active Auth Gateway"
grep -q 'status --porcelain' "${ROOT}/control-plane/scripts/publish-auth-gateway.sh" \
  || fail "control-plane publisher does not reject dirty source"
grep -q 'status --porcelain' "${ROOT}/infra/lore/scripts/docker-buildx-lore.sh" \
  || fail "Lore publisher does not reject dirty source"
grep -q 'org.opencontainers.image.revision' "${ROOT}/control-plane/scripts/publish-auth-gateway.sh" \
  || fail "control-plane image lacks a source revision label"
grep -q 'org.opencontainers.image.revision' "${ROOT}/infra/lore/scripts/docker-buildx-lore.sh" \
  || fail "Lore image lacks a source revision label"
grep -q 'EXPECTED_SOURCE_COMMIT' "${ROOT}/infra/pulumi/scripts/verify-and-promote-image.sh" \
  || fail "promotion is not bound to source provenance"

if grep -rn --exclude=test-pipeline.sh \
    -E 'portalshq/(control-plane|lore-server)|(:latest|nightly)' \
    "${ROOT}/infra/pulumi/index.ts" \
    "${ROOT}/control-plane/scripts/publish-auth-gateway.sh" \
    "${ROOT}/infra/lore/scripts/docker-buildx-lore.sh" \
    "${ROOT}/infra/lore/versions.yaml" 2>/dev/null; then
  fail "mutable or external production image reference remains"
fi

grep -q 'ECR_REGISTRY' "${ROOT}/control-plane/scripts/publish-auth-gateway.sh" \
  || fail "control-plane publisher does not require ECR_REGISTRY"
grep -q 'ECR_REGISTRY' "${ROOT}/infra/lore/scripts/docker-buildx-lore.sh" \
  || fail "Lore publisher does not require ECR_REGISTRY"

echo "All release pipeline checks passed."

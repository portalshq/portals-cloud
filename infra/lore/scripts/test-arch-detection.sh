#!/usr/bin/env bash
# Regression checks for the multi-architecture, digest-pinned Lore publisher.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PUBLISHER="${ROOT}/infra/lore/scripts/docker-buildx-lore.sh"
BASE_DOCKERFILE="${ROOT}/infra/lore/Dockerfile.loreserver.base"
RUNTIME_DOCKERFILE="${ROOT}/infra/lore/Dockerfile.loreserver"

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

grep -q ': "${ECR_REGISTRY:?' "${PUBLISHER}" \
    || fail "publisher must require ECR_REGISTRY"
grep -q 'PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"' "${PUBLISHER}" \
    || fail "publisher must default to amd64+arm64"
grep -q -- '--platform "${PLATFORMS}"' "${PUBLISHER}" \
    || fail "both builds must use the multi-architecture platform set"
grep -q 'BASE_PIN="${BASE_REPOSITORY}@${BASE_DIGEST}"' "${PUBLISHER}" \
    || fail "base image is not resolved to a digest"
grep -q 'SERVER_PIN="${SERVER_REPOSITORY}@${SERVER_DIGEST}"' "${PUBLISHER}" \
    || fail "runtime image is not resolved to a digest"
grep -q '^ARG BASE_IMAGE$' "${RUNTIME_DOCKERFILE}" \
    || fail "runtime Dockerfile does not accept a pinned base image"
grep -q '^FROM ${BASE_IMAGE}$' "${RUNTIME_DOCKERFILE}" \
    || fail "runtime Dockerfile does not consume the pinned base image"

if grep -nE 'portalshq/|latest-|nightly' \
    "${PUBLISHER}" "${BASE_DOCKERFILE}" "${RUNTIME_DOCKERFILE}"; then
    fail "legacy Docker Hub or mutable architecture tag remains"
fi

bash -n "${PUBLISHER}"
printf 'ok: Lore publisher builds multi-architecture ECR images and pins both digests\n'

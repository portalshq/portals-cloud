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
test "$(grep -c -- '--platform "linux/${arch}"' "${PUBLISHER}")" -ge 2 \
    || fail "base and server builds must each set an explicit per-arch platform"
grep -q 'docker buildx build --platform "linux/${arch}"' "${PUBLISHER}" \
    || fail "builds must stamp an explicit platform (no builder-native defaults)"
grep -q 'BASE_PIN="${BASE_REPOSITORY}@${BASE_DIGEST}"' "${PUBLISHER}" \
    || fail "base image is not resolved to a digest"
grep -q 'SERVER_PIN="${SERVER_REPOSITORY}@${SERVER_DIGEST}"' "${PUBLISHER}" \
    || fail "runtime image is not resolved to a digest"
grep -q '^ARG BASE_IMAGE$' "${RUNTIME_DOCKERFILE}" \
    || fail "runtime Dockerfile does not accept a pinned base image"
grep -q '^FROM --platform=\$TARGETPLATFORM \${BASE_IMAGE}$' "${RUNTIME_DOCKERFILE}" \
    || fail "runtime Dockerfile does not consume the pinned base image under \$TARGETPLATFORM"
grep -q 'FROM --platform=\$BUILDPLATFORM rust:' "${ROOT}/infra/lore/Dockerfile.loreserver.base" \
    || fail "base builder stage must run on \$BUILDPLATFORM (native, no QEMU)"
grep -q 'FROM --platform=\$TARGETPLATFORM gcr.io/distroless' "${ROOT}/infra/lore/Dockerfile.loreserver.base" \
    || fail "base runtime stage must follow \$TARGETPLATFORM"
grep -q 'unsupported TARGETPLATFORM' "${ROOT}/infra/lore/Dockerfile.loreserver.base" \
    || fail "base image must fail fast on non-arm64 targets"
grep -q 'FROM --platform=\$TARGETPLATFORM \${BASE_IMAGE}' "${RUNTIME_DOCKERFILE}" \
    || fail "server runtime must select the target platform of the pinned base index"

AUTH_DOCKERFILE="${ROOT}/docker/auth-gateway/Dockerfile"
grep -q 'FROM --platform=\$BUILDPLATFORM rust:' "${AUTH_DOCKERFILE}" \
    || fail "auth-gateway builder stage must run on \$BUILDPLATFORM (native, no QEMU)"
grep -q 'FROM --platform=\$TARGETPLATFORM gcr.io/distroless' "${AUTH_DOCKERFILE}" \
    || fail "auth-gateway runtime stage must follow \$TARGETPLATFORM"
grep -q 'unsupported TARGETPLATFORM' "${AUTH_DOCKERFILE}" \
    || fail "auth-gateway image must fail fast on non-arm64 targets"

if grep -nE 'portalshq/|latest-|nightly' \
    "${PUBLISHER}" "${BASE_DOCKERFILE}" "${RUNTIME_DOCKERFILE}"; then
    fail "legacy Docker Hub or mutable architecture tag remains"
fi

bash -n "${PUBLISHER}"
printf 'ok: Lore publisher builds multi-architecture ECR images and pins both digests\n'

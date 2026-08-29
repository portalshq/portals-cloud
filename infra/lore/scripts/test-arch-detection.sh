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
grep -q 'TARGETARCH="${LORE_TARGETARCH:-${TARGETARCH:-amd64}}"' "${PUBLISHER}" \
    || fail "t3.micro release receipt must default to linux/amd64"
test "$(grep -c -- '--build-arg "LORE_BUILD_VERSION_NAME=${VERSION}"' "${PUBLISHER}")" -eq 2 \
    || fail "every Lore base build path must pass the immutable release tag"
test "$(grep -c -- '--platform "linux/${arch}"' "${PUBLISHER}")" -ge 2 \
    || fail "base and server builds must each set an explicit per-arch platform"
grep -q 'docker buildx build --platform "linux/${arch}"' "${PUBLISHER}" \
    || fail "builds must stamp an explicit platform (no builder-native defaults)"
grep -q 'BASE_PIN="${BASE_REPOSITORY}@${BASE_DIGEST}"' "${PUBLISHER}" \
    || fail "base image is not resolved to a digest"
grep -q 'SERVER_PIN="${SERVER_REPOSITORY}@${SERVER_DIGEST}"' "${PUBLISHER}" \
    || fail "runtime image is not resolved to a digest"
grep -q 'EXPECTED_LIBRARY_VERSION="${PACKAGE_VERSION}+${VERSION}"' "${PUBLISHER}" \
    || fail "publisher must derive the exact embedded Lore version"
grep -q 'docker run --rm --platform "linux/${TARGETARCH}"' "${PUBLISHER}" \
    || fail "publisher must execute the exact target-platform runtime digest"
grep -q 'Server version: ${EXPECTED_LIBRARY_VERSION}' "${PUBLISHER}" \
    || fail "publisher must reject a binary with incorrect embedded version metadata"
grep -q '^ARG BASE_IMAGE$' "${RUNTIME_DOCKERFILE}" \
    || fail "runtime Dockerfile does not accept a pinned base image"
grep -q '^FROM --platform=\$TARGETPLATFORM \${BASE_IMAGE}$' "${RUNTIME_DOCKERFILE}" \
    || fail "runtime Dockerfile does not consume the pinned base image under \$TARGETPLATFORM"
grep -q 'FROM --platform=\$BUILDPLATFORM rust:' "${ROOT}/infra/lore/Dockerfile.loreserver.base" \
    || fail "base builder stage must run on \$BUILDPLATFORM (native, no QEMU)"
grep -q 'FROM --platform=\$TARGETPLATFORM gcr.io/distroless' "${ROOT}/infra/lore/Dockerfile.loreserver.base" \
    || fail "base runtime stage must follow \$TARGETPLATFORM"
grep -q 'linux/amd64)' "${ROOT}/infra/lore/Dockerfile.loreserver.base" \
    || fail "base image must support the t3.micro linux/amd64 target"
grep -q 'linux/arm64)' "${ROOT}/infra/lore/Dockerfile.loreserver.base" \
    || fail "base image must retain linux/arm64 support"
grep -q 'unsupported TARGETPLATFORM' "${ROOT}/infra/lore/Dockerfile.loreserver.base" \
    || fail "base image must fail fast on unsupported targets"
grep -q '^ARG LORE_BUILD_VERSION_NAME$' "${BASE_DOCKERFILE}" \
    || fail "base image must accept the immutable Lore release tag"
grep -q 'test -n "\$LORE_BUILD_VERSION_NAME"' "${BASE_DOCKERFILE}" \
    || fail "base image must reject an empty Lore release tag"
grep -q 'export LORE_BUILD_VERSION_NAME' "${BASE_DOCKERFILE}" \
    || fail "cargo builds must receive the Lore release tag"
grep -q 'FROM --platform=\$TARGETPLATFORM \${BASE_IMAGE}' "${RUNTIME_DOCKERFILE}" \
    || fail "server runtime must select the target platform of the pinned base index"

AUTH_DOCKERFILE="${ROOT}/docker/auth-gateway/Dockerfile"
grep -q 'FROM --platform=\$BUILDPLATFORM rust:' "${AUTH_DOCKERFILE}" \
    || fail "auth-gateway builder stage must run on \$BUILDPLATFORM (native, no QEMU)"
grep -q 'FROM --platform=\$TARGETPLATFORM gcr.io/distroless' "${AUTH_DOCKERFILE}" \
    || fail "auth-gateway runtime stage must follow \$TARGETPLATFORM"
grep -q 'linux/amd64|linux/arm64)' "${AUTH_DOCKERFILE}" \
    || fail "auth-gateway image must support both amd64 and arm64"
grep -q 'target/release/lore-auth-gateway' "${AUTH_DOCKERFILE}" \
    || fail "auth-gateway image must build natively for the t3.micro amd64 host"
grep -q 'if \[ "\$TARGETPLATFORM" = "linux/arm64" \]' "${AUTH_DOCKERFILE}" \
    || fail "auth-gateway must install the arm64 cross toolchain only for arm64 builds"
grep -q 'unsupported TARGETPLATFORM' "${AUTH_DOCKERFILE}" \
    || fail "auth-gateway image must fail fast on unsupported targets"

if grep -nE 'portalshq/|latest-|nightly' \
    "${PUBLISHER}" "${BASE_DOCKERFILE}" "${RUNTIME_DOCKERFILE}"; then
    fail "legacy Docker Hub or mutable architecture tag remains"
fi

bash -n "${PUBLISHER}"
printf 'ok: Lore publisher builds multi-architecture ECR images and pins both digests\n'

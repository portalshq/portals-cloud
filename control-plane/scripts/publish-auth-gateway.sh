#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROMOTE_SCRIPT="${ROOT}/infra/pulumi/scripts/verify-and-promote-image.sh"
: "${ECR_REGISTRY:?Set ECR_REGISTRY (for example 123456789012.dkr.ecr.us-east-1.amazonaws.com)}"
ECR_NAMESPACE="${ECR_NAMESPACE:-portals-${ENVIRONMENT:-dev}}"
REPOSITORY="${AUTH_GATEWAY_ECR_REPOSITORY:-${ECR_REGISTRY}/${ECR_NAMESPACE}/auth-gateway}"
TAG="$(git -C "${ROOT}" rev-parse --short HEAD)-$(date +%Y%m%d-%H%M%S)"
TAGGED_IMAGE="${REPOSITORY}:${TAG}"
TARGETARCH="${AUTH_TARGETARCH:-${TARGETARCH:-arm64}}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
REQUIRE_SIGNATURE="${REQUIRE_SIGNATURE:-false}"
SOURCE_COMMIT="$(git -C "${ROOT}" rev-parse HEAD)"
PROTOCOL_ROOT="${ROOT}/infra/lore/lore"
PROTOCOL_COMMIT="$(git -C "${PROTOCOL_ROOT}" rev-parse HEAD)"

ROOT_DIRTY="$(git -C "${ROOT}" status --porcelain -- control-plane docker/auth-gateway .dockerignore)"
PROTOCOL_DIRTY="$(git -C "${PROTOCOL_ROOT}" status --porcelain -- \
  lore-proto/proto/auth_api.proto lore-proto/proto/rebac_api.proto)"
if [[ -n "${ROOT_DIRTY}" || -n "${PROTOCOL_DIRTY}" ]]; then
  echo "Refusing a production control-plane image from uncommitted source." >&2
  [[ -n "${ROOT_DIRTY}" ]] && printf '%s\n' "${ROOT_DIRTY}" >&2
  [[ -n "${PROTOCOL_DIRTY}" ]] && printf '%s\n' "${PROTOCOL_DIRTY}" >&2
  exit 2
fi

# Production pins need a signature bound to this exact immutable digest.  The
# Auth Gateway's JWT-signing key is a different trust domain and must not sign
# artifacts.
if [[ "${ENVIRONMENT:-dev}" == "prod" && "${REQUIRE_SIGNATURE}" != "true" ]]; then
  echo "Production Auth Gateway publication requires REQUIRE_SIGNATURE=true." >&2
  exit 2
fi

# Determine build strategy: single-arch (cross-compile) or multi-arch (manifest merge)
if [[ "${PLATFORMS}" == *","* ]]; then
  # Multi-arch mode: build each arch separately, then create manifest list
  BUILD_STRATEGY="multiarch"
  IFS=',' read -ra ARCHS <<< "${PLATFORMS}"
else
  # Single-arch mode: cross-compile natively on host (no --platform)
  BUILD_STRATEGY="single"
  ARCHS=("${PLATFORMS#linux/}")
fi

# Build image for each architecture
for arch in "${ARCHS[@]}"; do
  ARCH_TAG="${TAG}-${arch}"
  if [[ "${BUILD_STRATEGY}" == "multiarch" ]]; then
    docker buildx build --platform "linux/${arch}" --provenance=true --sbom=true --push \
      --label "org.opencontainers.image.revision=${SOURCE_COMMIT}" \
      --label "io.portals.protocol-revision=${PROTOCOL_COMMIT}" \
      -t "${REPOSITORY}:${ARCH_TAG}" -f "${ROOT}/docker/auth-gateway/Dockerfile" "${ROOT}"
  else
    # Single-arch: cross-compile natively (Dockerfile handles target)
    docker buildx build --provenance=true --sbom=true --push \
      --label "org.opencontainers.image.revision=${SOURCE_COMMIT}" \
      --label "io.portals.protocol-revision=${PROTOCOL_COMMIT}" \
      -t "${REPOSITORY}:${ARCH_TAG}" -f "${ROOT}/docker/auth-gateway/Dockerfile" "${ROOT}"
  fi
done

# Create multi-arch manifest if needed
if [[ "${BUILD_STRATEGY}" == "multiarch" ]]; then
  docker buildx imagetools create -t "${TAGGED_IMAGE}" \
    "${REPOSITORY}:${TAG}-amd64" \
    "${REPOSITORY}:${TAG}-arm64"
else
  # Single-arch: create base tag pointing to the arch-specific manifest
  docker buildx imagetools create -t "${TAGGED_IMAGE}" "${REPOSITORY}:${TAG}-${ARCHS[0]}"
fi

DIGEST="$(docker buildx imagetools inspect "${TAGGED_IMAGE}" | awk '/^Digest:/ {print $2; exit}')"
[[ "${DIGEST}" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo "Could not resolve pushed digest" >&2; exit 1; }
PIN="${REPOSITORY}@${DIGEST}"

if [[ "${REQUIRE_SIGNATURE}" == "true" ]]; then
  command -v cosign >/dev/null || { echo "cosign is required when REQUIRE_SIGNATURE=true" >&2; exit 2; }
  : "${COSIGN_KEY:?Set COSIGN_KEY to the dedicated artifact-signing KMS URI or key reference}"
  cosign sign --yes --key "${COSIGN_KEY}" "${PIN}"
fi

EXPECTED_SOURCE_COMMIT="${SOURCE_COMMIT}" EXPECTED_PROTOCOL_COMMIT="${PROTOCOL_COMMIT}" \
  REQUIRE_SIGNATURE="${REQUIRE_SIGNATURE}" COSIGN_KEY="${COSIGN_KEY:-}" \
  TRIVY_BIN="${TRIVY_BIN:-trivy}" "${PROMOTE_SCRIPT}" control-plane "${PIN}" "linux/${TARGETARCH}"
printf 'Auth Gateway image pinned: %s\n' "${PIN}"
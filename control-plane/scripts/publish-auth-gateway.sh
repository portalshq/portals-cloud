#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROMOTE_SCRIPT="${ROOT}/infra/pulumi/scripts/verify-and-promote-image.sh"
VERSIONS_FILE="${ROOT}/infra/lore/versions.yaml"

# Tag components must stay safe for every registry and consumer that echoes
# them back; fail before any build work instead of late at docker push.
require_tag_component() {
  local name="$1" value="$2"
  if [[ ! "${value}" =~ ^[A-Za-z0-9._-]{1,64}$ ]]; then
    echo "ERROR: ${name} '${value}' must match ^[A-Za-z0-9._-]{1,64}\$" >&2
    exit 2
  fi
}

# ECR reads can lag a just-created manifest briefly; retry rather than kill a
# fully-built push at the final step.
resolve_digest() {
  local ref="$1" attempt out=""
  for attempt in 1 2 3; do
    out="$(docker buildx imagetools inspect "${ref}" 2>/dev/null | awk '/^Digest:/ {print $2; exit}' || true)"
    if [[ "${out}" =~ ^sha256:[a-f0-9]{64}$ ]]; then
      printf '%s\n' "${out}"
      return 0
    fi
    echo "Digest resolve attempt ${attempt}/3 failed for ${ref}; sleeping 5s..." >&2
    sleep 5
  done
  echo "ERROR: unable to resolve digest for ${ref}" >&2
  return 1
}

: "${ECR_REGISTRY:?Set ECR_REGISTRY (for example 123456789012.dkr.ecr.us-east-1.amazonaws.com)}"
ECR_NAMESPACE="${ECR_NAMESPACE:-portals-${ENVIRONMENT:-dev}}"
REPOSITORY="${AUTH_GATEWAY_ECR_REPOSITORY:-${ECR_REGISTRY}/${ECR_NAMESPACE}/auth-gateway}"

# Build identifier: UTC timestamp + 32-bit urandom suffix. Honors an external
# BUILD_ID for automation — external IDs are caller-guaranteed unique; fresh
# generated IDs are what keep rapid successive builds conflict-free against
# ECR immutability. Commit hashes deliberately live in OCI labels/provenance.
BUILD_ID="${BUILD_ID:-$(date -u +%Y%m%d-%H%M%S)-$(od -An -tx4 -N4 /dev/urandom | tr -d ' ')}"
require_tag_component BUILD_ID "${BUILD_ID}"

# Extract release.version from the BOM for consistent, release-numbered tags.
# Anchored parse of the release block; abort rather than mislabel on failure.
AUTH_VERSION="${AUTH_VERSION:-$(awk '
  /^release:/ { in_release = 1; next }
  in_release && /^[^[:space:]#]/ { exit }
  in_release && /^[[:space:]]+version:/ {
    line = $0
    gsub(/[[:space:]]/, "", line)
    sub(/^version:/, "", line)
    gsub(/"/, "", line)
    sub(/#.*/, "", line)
    print line
    exit
  }
' "${VERSIONS_FILE}")}"
if [[ -z "${AUTH_VERSION}" ]]; then
  echo "ERROR: could not extract release.version from ${VERSIONS_FILE}; refusing to tag." >&2
  exit 2
fi
require_tag_component AUTH_VERSION "${AUTH_VERSION}"
TAG="${AUTH_VERSION}-build-${BUILD_ID}"
TAGGED_IMAGE="${REPOSITORY}:${TAG}"
TARGETARCH="${AUTH_TARGETARCH:-${TARGETARCH:-amd64}}"
PLATFORMS="${AUTH_PLATFORMS:-${PLATFORMS:-linux/amd64,linux/arm64}}"
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
      --label "io.portals.build-id=${BUILD_ID}" \
      -t "${REPOSITORY}:${ARCH_TAG}" -f "${ROOT}/docker/auth-gateway/Dockerfile" "${ROOT}"
  else
    # Single-arch: cross-compile natively (stamped to linux/${arch})
    docker buildx build --platform "linux/${arch}" --provenance=true --sbom=true --push \
      --label "org.opencontainers.image.revision=${SOURCE_COMMIT}" \
      --label "io.portals.protocol-revision=${PROTOCOL_COMMIT}" \
      --label "io.portals.build-id=${BUILD_ID}" \
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

DIGEST="$(resolve_digest "${TAGGED_IMAGE}")"
PIN="${REPOSITORY}@${DIGEST}"

if [[ "${REQUIRE_SIGNATURE}" == "true" ]]; then
  command -v cosign >/dev/null || { echo "cosign is required when REQUIRE_SIGNATURE=true" >&2; exit 2; }
  : "${COSIGN_KEY:?Set COSIGN_KEY to the dedicated artifact-signing KMS URI or key reference}"
  AWS_REGION="${AWS_REGION:-us-east-1}" cosign sign --yes --key "${COSIGN_KEY}" "${PIN}"
fi

EXPECTED_SOURCE_COMMIT="${SOURCE_COMMIT}" EXPECTED_PROTOCOL_COMMIT="${PROTOCOL_COMMIT}" \
  REQUIRE_SIGNATURE="${REQUIRE_SIGNATURE}" COSIGN_KEY="${COSIGN_KEY:-}" \
  "${PROMOTE_SCRIPT}" control-plane "${PIN}" "linux/${TARGETARCH}"
printf 'Auth Gateway image pinned: %s (build ID: %s)\n' "${PIN}" "${BUILD_ID}"

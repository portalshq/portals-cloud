#!/usr/bin/env bash
# Build Lore once, push multi-architecture images to ECR, and record immutable
# manifest digests. Mutable tags are publishing handles only.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
PROMOTE_SCRIPT="${REPO_ROOT}/infra/pulumi/scripts/verify-and-promote-image.sh"

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
VERSION="${1:-$(git -C "${REPO_ROOT}" rev-parse --short HEAD)}"
require_tag_component VERSION "${VERSION}"
ECR_NAMESPACE="${ECR_NAMESPACE:-portals-${ENVIRONMENT:-dev}}"
REPOSITORY="${LORE_ECR_REPOSITORY:-${ECR_REGISTRY}/${ECR_NAMESPACE}/lore}"
BASE_REPOSITORY="${REPOSITORY}"
SERVER_REPOSITORY="${REPOSITORY}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
REQUIRE_SIGNATURE="${REQUIRE_SIGNATURE:-false}"
# The one-host release profile uses a t3.micro (x86_64). Multi-arch builds
# remain available, but promote the host's runnable amd64 manifest by default.
TARGETARCH="${LORE_TARGETARCH:-${TARGETARCH:-amd64}}"

# Build identifier: UTC timestamp + 32-bit urandom suffix. Honors an external
# BUILD_ID for automation — external IDs are caller-guaranteed unique; fresh
# generated IDs are what keep rapid successive builds conflict-free against
# ECR immutability. Commit hashes deliberately live in OCI labels/provenance,
# not in the tag (tag-tail hashes refer to the packaging repo only).
BUILD_ID="${BUILD_ID:-$(date -u +%Y%m%d-%H%M%S)-$(od -An -tx4 -N4 /dev/urandom | tr -d ' ')}"
require_tag_component BUILD_ID "${BUILD_ID}"
BASE_TAG="${VERSION}-build-${BUILD_ID}-base"
SERVER_TAG="${VERSION}-build-${BUILD_ID}"
SOURCE_ROOT="${REPO_ROOT}/infra/lore/lore"
SOURCE_COMMIT="$(git -C "${SOURCE_ROOT}" rev-parse HEAD)"
PACKAGING_COMMIT="$(git -C "${REPO_ROOT}" rev-parse HEAD)"

SOURCE_DIRTY="$(git -C "${SOURCE_ROOT}" status --porcelain)"
PACKAGING_DIRTY="$(git -C "${REPO_ROOT}" status --porcelain -- \
  .dockerignore infra/lore/Dockerfile.loreserver infra/lore/Dockerfile.loreserver.base \
  infra/lore/scripts/docker-buildx-lore.sh)"
if [[ -n "${SOURCE_DIRTY}" || -n "${PACKAGING_DIRTY}" ]]; then
  echo "Refusing a production Lore image from uncommitted source or packaging." >&2
  [[ -n "${SOURCE_DIRTY}" ]] && printf '%s\n' "${SOURCE_DIRTY}" >&2
  [[ -n "${PACKAGING_DIRTY}" ]] && printf '%s\n' "${PACKAGING_DIRTY}" >&2
  exit 2
fi

# Production pins are release artifacts, not merely scan-clean build outputs.
# Refuse to write a production pin unless the exact manifest is signed by the
# dedicated artifact signer.  The JWT KMS key must never be used here.
if [[ "${ENVIRONMENT:-dev}" == "prod" && "${REQUIRE_SIGNATURE}" != "true" ]]; then
  echo "Production Lore publication requires REQUIRE_SIGNATURE=true." >&2
  exit 2
fi

# Determine build strategy: single-arch (cross-compile) or multi-arch (manifest merge)
if [[ "${PLATFORMS}" == *","* ]]; then
  # Multi-arch mode: build each arch separately, then create manifest list
  BUILD_STRATEGY="multiarch"
  IFS=',' read -ra ARCHS <<< "${PLATFORMS}"
  # Tag-safe arch names: strip the linux/ prefix (a slash is invalid in tags).
  ARCHS=("${ARCHS[@]//linux\//}")
else
  # Single-arch mode: cross-compile natively on host (no --platform)
  BUILD_STRATEGY="single"
  ARCHS=("${PLATFORMS#linux/}")
fi

# Build base image for each architecture
for arch in "${ARCHS[@]}"; do
  ARCH_TAG="${BASE_TAG}-${arch}"
  if [[ "${BUILD_STRATEGY}" == "multiarch" ]]; then
    docker buildx build --platform "linux/${arch}" \
      --build-arg "LORE_BUILD_VERSION_NAME=${VERSION}" \
      -f "${REPO_ROOT}/infra/lore/Dockerfile.loreserver.base" \
      --label "org.opencontainers.image.revision=${SOURCE_COMMIT}" \
      --label "io.portals.packaging-revision=${PACKAGING_COMMIT}" \
      --label "io.portals.build-id=${BUILD_ID}" \
      -t "${BASE_REPOSITORY}:${ARCH_TAG}" --provenance=true --sbom=true --push \
      "${SOURCE_ROOT}"
  else
    # Single-arch: cross-compile natively (builder runs $BUILDPLATFORM; the
    # flag stamps the manifest and selects the runtime stage's target arch)
    docker buildx build --platform "linux/${arch}" \
      --build-arg "LORE_BUILD_VERSION_NAME=${VERSION}" \
      -f "${REPO_ROOT}/infra/lore/Dockerfile.loreserver.base" \
      --label "org.opencontainers.image.revision=${SOURCE_COMMIT}" \
      --label "io.portals.packaging-revision=${PACKAGING_COMMIT}" \
      --label "io.portals.build-id=${BUILD_ID}" \
      -t "${BASE_REPOSITORY}:${ARCH_TAG}" --provenance=true --sbom=true --push \
      "${SOURCE_ROOT}"
  fi
done

# Create multi-arch manifest for base image if needed
if [[ "${BUILD_STRATEGY}" == "multiarch" ]]; then
  docker buildx imagetools create -t "${BASE_REPOSITORY}:${BASE_TAG}" \
    "${BASE_REPOSITORY}:${BASE_TAG}-amd64" \
    "${BASE_REPOSITORY}:${BASE_TAG}-arm64"
else
  # Single-arch: create base tag pointing to the arch-specific manifest
  docker buildx imagetools create -t "${BASE_REPOSITORY}:${BASE_TAG}" "${BASE_REPOSITORY}:${BASE_TAG}-${ARCHS[0]}"
fi

BASE_DIGEST="$(resolve_digest "${BASE_REPOSITORY}:${BASE_TAG}")"
BASE_PIN="${BASE_REPOSITORY}@${BASE_DIGEST}"

# Build server image for each architecture
for arch in "${ARCHS[@]}"; do
  ARCH_TAG="${SERVER_TAG}-${arch}"
  BASE_ARCH_TAG="${BASE_TAG}-${arch}"
  if [[ "${BUILD_STRATEGY}" == "multiarch" ]]; then
    docker buildx build --platform "linux/${arch}" \
      --build-arg "BASE_IMAGE=${BASE_REPOSITORY}:${BASE_ARCH_TAG}" \
      -f "${REPO_ROOT}/infra/lore/Dockerfile.loreserver" \
      --label "org.opencontainers.image.revision=${SOURCE_COMMIT}" \
      --label "io.portals.packaging-revision=${PACKAGING_COMMIT}" \
      --label "io.portals.build-id=${BUILD_ID}" \
      -t "${SERVER_REPOSITORY}:${ARCH_TAG}" --provenance=true --sbom=true --push \
      "${REPO_ROOT}"
  else
    # Single-arch: cross-compile natively (stamped to linux/${arch})
    docker buildx build --platform "linux/${arch}" \
      --build-arg "BASE_IMAGE=${BASE_PIN}" \
      -f "${REPO_ROOT}/infra/lore/Dockerfile.loreserver" \
      --label "org.opencontainers.image.revision=${SOURCE_COMMIT}" \
      --label "io.portals.packaging-revision=${PACKAGING_COMMIT}" \
      --label "io.portals.build-id=${BUILD_ID}" \
      -t "${SERVER_REPOSITORY}:${ARCH_TAG}" --provenance=true --sbom=true --push \
      "${REPO_ROOT}"
  fi
done

# Create multi-arch manifest for server image if needed
if [[ "${BUILD_STRATEGY}" == "multiarch" ]]; then
  docker buildx imagetools create -t "${SERVER_REPOSITORY}:${SERVER_TAG}" \
    "${SERVER_REPOSITORY}:${SERVER_TAG}-amd64" \
    "${SERVER_REPOSITORY}:${SERVER_TAG}-arm64"
else
  # Single-arch: create base tag pointing to the arch-specific manifest
  docker buildx imagetools create -t "${SERVER_REPOSITORY}:${SERVER_TAG}" "${SERVER_REPOSITORY}:${SERVER_TAG}-${ARCHS[0]}"
fi

SERVER_DIGEST="$(resolve_digest "${SERVER_REPOSITORY}:${SERVER_TAG}")"
SERVER_PIN="${SERVER_REPOSITORY}@${SERVER_DIGEST}"

# Verify the executable inside the exact deployable digest, not merely the
# Docker build arguments. Invalid local configuration makes the server exit
# immediately after printing its embedded library version, without opening a
# listener or contacting a backing service.
PACKAGE_VERSION="$(sed -n 's/^version = "\([^"]*\)"$/\1/p' "${SOURCE_ROOT}/Cargo.toml" | head -n 1)"
if [[ -z "${PACKAGE_VERSION}" ]]; then
  echo "ERROR: unable to read the Lore workspace package version." >&2
  exit 2
fi
EXPECTED_LIBRARY_VERSION="${PACKAGE_VERSION}+${VERSION}"
VERSION_OUTPUT="$(docker run --rm --platform "linux/${TARGETARCH}" \
  -e LORE__SERVER=invalid "${SERVER_PIN}" 2>&1 || true)"
if ! grep -Fq -- "Server version: ${EXPECTED_LIBRARY_VERSION}" <<< "${VERSION_OUTPUT}"; then
  echo "ERROR: Lore image does not report expected embedded version ${EXPECTED_LIBRARY_VERSION}." >&2
  printf '%s\n' "${VERSION_OUTPUT}" >&2
  exit 2
fi
printf 'Verified embedded Lore version: %s\n' "${EXPECTED_LIBRARY_VERSION}"

if [[ "${REQUIRE_SIGNATURE}" == "true" ]]; then
  command -v cosign >/dev/null || { echo "cosign is required when REQUIRE_SIGNATURE=true" >&2; exit 2; }
  : "${COSIGN_KEY:?Set COSIGN_KEY to the dedicated artifact-signing KMS URI or key reference}"
  AWS_REGION="${AWS_REGION:-us-east-1}" cosign sign --yes --key "${COSIGN_KEY}" "${SERVER_PIN}"
fi

# The base pin is build input, not a deployable service. Record it only after
# the derived runtime has passed both ECR and Trivy scans plus attestation
# decoding. The promotion helper updates the runtime pin last.
EXPECTED_SOURCE_COMMIT="${SOURCE_COMMIT}" EXPECTED_PACKAGING_COMMIT="${PACKAGING_COMMIT}" \
  EXPECTED_BASE_IMAGE="${BASE_PIN}" \
  REQUIRE_SIGNATURE="${REQUIRE_SIGNATURE}" COSIGN_KEY="${COSIGN_KEY:-}" \
  "${PROMOTE_SCRIPT}" lore "${SERVER_PIN}" "linux/${TARGETARCH}"

printf 'Lore image pinned: %s (build ID: %s)\n' "${SERVER_PIN}" "${BUILD_ID}"

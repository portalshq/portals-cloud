#!/usr/bin/env bash
# Build Lore once, push multi-architecture images to ECR, and record immutable
# manifest digests. Mutable tags are publishing handles only.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
VERSIONS_FILE="${REPO_ROOT}/infra/lore/versions.yaml"
PROMOTE_SCRIPT="${REPO_ROOT}/infra/pulumi/scripts/verify-and-promote-image.sh"

: "${ECR_REGISTRY:?Set ECR_REGISTRY (for example 123456789012.dkr.ecr.us-east-1.amazonaws.com)}"
VERSION="${1:-$(git -C "${REPO_ROOT}" rev-parse --short HEAD)}"
ECR_NAMESPACE="${ECR_NAMESPACE:-portals-${ENVIRONMENT:-dev}}"
REPOSITORY="${LORE_ECR_REPOSITORY:-${ECR_REGISTRY}/${ECR_NAMESPACE}/lore}"
BASE_REPOSITORY="${REPOSITORY}"
SERVER_REPOSITORY="${REPOSITORY}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
REQUIRE_SIGNATURE="${REQUIRE_SIGNATURE:-false}"
BASE_TAG="${VERSION}-base"
SERVER_TAG="${VERSION}"
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

docker buildx build --platform "${PLATFORMS}" \
  -f "${REPO_ROOT}/infra/lore/Dockerfile.loreserver.base" \
  --label "org.opencontainers.image.revision=${SOURCE_COMMIT}" \
  --label "io.portals.packaging-revision=${PACKAGING_COMMIT}" \
  -t "${BASE_REPOSITORY}:${BASE_TAG}" --provenance=true --sbom=true --push \
  "${SOURCE_ROOT}"

BASE_DIGEST="$(docker buildx imagetools inspect "${BASE_REPOSITORY}:${BASE_TAG}" | awk '/^Digest:/ {print $2; exit}')"
[[ "${BASE_DIGEST}" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo "Could not resolve base digest" >&2; exit 1; }
BASE_PIN="${BASE_REPOSITORY}@${BASE_DIGEST}"

docker buildx build --platform "${PLATFORMS}" \
  --build-arg "BASE_IMAGE=${BASE_PIN}" \
  -f "${REPO_ROOT}/infra/lore/Dockerfile.loreserver" \
  --label "org.opencontainers.image.revision=${SOURCE_COMMIT}" \
  --label "io.portals.packaging-revision=${PACKAGING_COMMIT}" \
  -t "${SERVER_REPOSITORY}:${SERVER_TAG}" --provenance=true --sbom=true --push \
  "${REPO_ROOT}"

SERVER_DIGEST="$(docker buildx imagetools inspect "${SERVER_REPOSITORY}:${SERVER_TAG}" | awk '/^Digest:/ {print $2; exit}')"
[[ "${SERVER_DIGEST}" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo "Could not resolve server digest" >&2; exit 1; }
SERVER_PIN="${SERVER_REPOSITORY}@${SERVER_DIGEST}"

if [[ "${REQUIRE_SIGNATURE}" == "true" ]]; then
  command -v cosign >/dev/null || { echo "cosign is required when REQUIRE_SIGNATURE=true" >&2; exit 2; }
  : "${COSIGN_KEY:?Set COSIGN_KEY to the dedicated artifact-signing KMS URI or key reference}"
  cosign sign --yes --key "${COSIGN_KEY}" "${SERVER_PIN}"
fi

# The base pin is build input, not a deployable service. Record it only after
# the derived runtime has passed both ECR and Trivy scans plus attestation
# decoding. The promotion helper updates the runtime pin last.
EXPECTED_SOURCE_COMMIT="${SOURCE_COMMIT}" EXPECTED_PACKAGING_COMMIT="${PACKAGING_COMMIT}" \
  REQUIRE_SIGNATURE="${REQUIRE_SIGNATURE}" COSIGN_KEY="${COSIGN_KEY:-}" \
  TRIVY_BIN="${TRIVY_BIN:-trivy}" "${PROMOTE_SCRIPT}" lore "${SERVER_PIN}" "linux/${TARGETARCH:-arm64}"
awk -v base="${BASE_PIN}" '
  /^lore:/ { in_lore = 1 }
  in_lore && /^  base_image:/ { sub(/^  base_image:.*/, "  base_image: \"" base "\"") }
  in_lore && /^  image:/ { in_lore = 0 }
  { print }
' "${VERSIONS_FILE}" > "${VERSIONS_FILE}.tmp"
mv "${VERSIONS_FILE}.tmp" "${VERSIONS_FILE}"

printf 'Lore image pinned: %s\n' "${SERVER_PIN}"

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PROMOTE_SCRIPT="${ROOT}/infra/pulumi/scripts/verify-and-promote-image.sh"
PACKAGE_FILE="${ROOT}/services/backend-service/package.json"

require_tag_component() {
  local name="$1" value="$2"
  if [[ ! "${value}" =~ ^[A-Za-z0-9._-]{1,64}$ ]]; then
    echo "ERROR: ${name} '${value}' must match ^[A-Za-z0-9._-]{1,64}\$" >&2
    exit 2
  fi
}

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
REPOSITORY="${BACKEND_ECR_REPOSITORY:-${ECR_REGISTRY}/${ECR_NAMESPACE}/backend-service}"
BUILD_ID="${BUILD_ID:-$(date -u +%Y%m%d-%H%M%S)-$(od -An -tx4 -N4 /dev/urandom | tr -d ' ')}"
require_tag_component BUILD_ID "${BUILD_ID}"

BACKEND_VERSION="${BACKEND_VERSION:-}"
if [[ -z "${BACKEND_VERSION}" ]]; then
  BACKEND_VERSION="$(node -p "require('${PACKAGE_FILE}').version")"
fi
require_tag_component BACKEND_VERSION "${BACKEND_VERSION}"
TAG="${BACKEND_VERSION}-build-${BUILD_ID}"
TAGGED_IMAGE="${REPOSITORY}:${TAG}"
TARGETARCH="${BACKEND_TARGETARCH:-${TARGETARCH:-amd64}}"
PLATFORM="linux/${TARGETARCH}"
REQUIRE_SIGNATURE="${REQUIRE_SIGNATURE:-false}"
SOURCE_COMMIT="$(git -C "${ROOT}" rev-parse HEAD)"

SOURCE_DIRTY="$(git -C "${ROOT}" status --porcelain -- \
  services/backend-service services/invitation-service services/lead-processing .dockerignore)"
if [[ -n "${SOURCE_DIRTY}" ]]; then
  echo "Refusing a production Backend image from uncommitted source." >&2
  printf '%s\n' "${SOURCE_DIRTY}" >&2
  exit 2
fi
if [[ "${ENVIRONMENT:-dev}" == "prod" && "${REQUIRE_SIGNATURE}" != "true" ]]; then
  echo "Production Backend publication requires REQUIRE_SIGNATURE=true." >&2
  exit 2
fi
[[ "${TARGETARCH}" =~ ^(amd64|arm64)$ ]] || { echo "BACKEND_TARGETARCH must be amd64 or arm64" >&2; exit 2; }

docker buildx build --platform "${PLATFORM}" --provenance=true --sbom=true --push \
  --label "org.opencontainers.image.revision=${SOURCE_COMMIT}" \
  --label "org.opencontainers.image.version=${BACKEND_VERSION}" \
  --label "io.portals.build-id=${BUILD_ID}" \
  -t "${TAGGED_IMAGE}" -f "${ROOT}/services/backend-service/Dockerfile" "${ROOT}"

DIGEST="$(resolve_digest "${TAGGED_IMAGE}")"
PIN="${REPOSITORY}@${DIGEST}"
if [[ "${REQUIRE_SIGNATURE}" == "true" ]]; then
  command -v cosign >/dev/null || { echo "cosign is required when REQUIRE_SIGNATURE=true" >&2; exit 2; }
  : "${COSIGN_KEY:?Set COSIGN_KEY to the dedicated artifact-signing KMS URI or key reference}"
  AWS_REGION="${AWS_REGION:-us-east-1}" cosign sign --yes --key "${COSIGN_KEY}" "${PIN}"
fi

EXPECTED_SOURCE_COMMIT="${SOURCE_COMMIT}" REQUIRE_SIGNATURE="${REQUIRE_SIGNATURE}" \
  COSIGN_KEY="${COSIGN_KEY:-}" "${PROMOTE_SCRIPT}" backend "${PIN}" "${PLATFORM}"
printf 'Backend image pinned: %s (build ID: %s)\n' "${PIN}" "${BUILD_ID}"

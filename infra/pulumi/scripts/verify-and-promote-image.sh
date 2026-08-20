#!/usr/bin/env bash
# Verify a runnable platform image, then atomically bind the immutable index pin
# to its evidence receipt. A failed check leaves versions.yaml unchanged.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

SERVICE="${1:?usage: verify-and-promote-image.sh <service> <image@sha256> [linux/arm64]}"
IMAGE="${2:?usage: verify-and-promote-image.sh <service> <image@sha256> [linux/arm64]}"
PLATFORM="${3:-linux/arm64}"
TRIVY_BIN="${TRIVY_BIN:-trivy}"
AWS_REGION="${AWS_REGION:-us-east-1}"
REQUIRE_SIGNATURE="${REQUIRE_SIGNATURE:-false}"
EXPECTED_SOURCE_COMMIT="${EXPECTED_SOURCE_COMMIT:-}"
EXPECTED_PACKAGING_COMMIT="${EXPECTED_PACKAGING_COMMIT:-}"
EXPECTED_PROTOCOL_COMMIT="${EXPECTED_PROTOCOL_COMMIT:-}"

[[ "${SERVICE}" =~ ^(lore|control-plane)$ ]] || { echo "unsupported service: ${SERVICE}" >&2; exit 2; }
[[ "${IMAGE}" =~ ^[^[:space:]@]+@sha256:[a-f0-9]{64}$ ]] || { echo "image must be pinned by sha256" >&2; exit 2; }
[[ "${PLATFORM}" =~ ^linux/(arm64|amd64)$ ]] || { echo "platform must be linux/arm64 or linux/amd64" >&2; exit 2; }
[[ "${EXPECTED_SOURCE_COMMIT}" =~ ^[a-f0-9]{40}$ ]] || { echo "EXPECTED_SOURCE_COMMIT must be a full clean Git commit" >&2; exit 2; }
if [[ "${SERVICE}" == "lore" ]]; then
  [[ "${EXPECTED_PACKAGING_COMMIT}" =~ ^[a-f0-9]{40}$ ]] || { echo "Lore requires EXPECTED_PACKAGING_COMMIT" >&2; exit 2; }
else
  [[ "${EXPECTED_PROTOCOL_COMMIT}" =~ ^[a-f0-9]{40}$ ]] || { echo "control-plane requires EXPECTED_PROTOCOL_COMMIT" >&2; exit 2; }
fi
command -v aws >/dev/null || { echo "aws CLI is required" >&2; exit 2; }
command -v docker >/dev/null || { echo "docker with buildx is required" >&2; exit 2; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 2; }

# Handle trivy check - support both local binary and Docker container
if [[ "${TRIVY_BIN}" == "trivy" ]]; then
  command -v trivy >/dev/null || { echo "Trivy is required; refusing to promote without an independent scan (install: https://aquasecurity.github.io/trivy/latest/getting-started/installation/)" >&2; exit 2; }
elif [[ "${TRIVY_BIN}" == docker* ]]; then
  # Verify docker is available (already checked above) and the trivy image can be pulled
  echo "Using trivy via Docker container"
  docker pull aquasec/trivy:latest >/dev/null 2>&1 || { echo "Failed to pull trivy Docker image" >&2; exit 2; }
else
  # Custom TRIVY_BIN path provided
  command -v "${TRIVY_BIN}" >/dev/null || { echo "Trivy is required; refusing to promote without an independent scan" >&2; exit 2; }
fi

REGISTRY="${IMAGE%%/*}"
REPOSITORY_AND_DIGEST="${IMAGE#*/}"
REPOSITORY="${REPOSITORY_AND_DIGEST%@sha256:*}"
INDEX_DIGEST="sha256:${IMAGE##*@sha256:}"
OS="${PLATFORM%/*}"
ARCH="${PLATFORM#*/}"

INDEX_MANIFEST="$(aws ecr batch-get-image \
  --region "${AWS_REGION}" \
  --repository-name "${REPOSITORY}" \
  --image-ids "imageDigest=${INDEX_DIGEST}" \
  --accepted-media-types application/vnd.oci.image.index.v1+json application/vnd.oci.image.manifest.v1+json \
  --query 'images[0].imageManifest' --output text)"
[[ -n "${INDEX_MANIFEST}" && "${INDEX_MANIFEST}" != "None" ]] || { echo "image is absent from ECR" >&2; exit 1; }

MEDIA_TYPE="$(jq -r '.mediaType' <<<"${INDEX_MANIFEST}")"
if [[ "${MEDIA_TYPE}" == "application/vnd.oci.image.index.v1+json" ]]; then
  PLATFORM_DIGEST="$(jq -r --arg os "${OS}" --arg arch "${ARCH}" \
    '.manifests[] | select(.platform.os == $os and .platform.architecture == $arch) | .digest' \
    <<<"${INDEX_MANIFEST}" | head -n 1)"
  ATTESTATION_COUNT="$(jq -r --arg digest "${PLATFORM_DIGEST}" \
    '[.manifests[] | select(.annotations["vnd.docker.reference.type"] == "attestation-manifest" and .annotations["vnd.docker.reference.digest"] == $digest)] | length' \
    <<<"${INDEX_MANIFEST}")"
else
  PLATFORM_DIGEST="${INDEX_DIGEST}"
  ATTESTATION_COUNT=0
fi
[[ "${PLATFORM_DIGEST}" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo "no ${PLATFORM} runnable manifest" >&2; exit 1; }
[[ "${ATTESTATION_COUNT}" -gt 0 ]] || { echo "no SBOM/provenance attestation for ${PLATFORM_DIGEST}" >&2; exit 1; }

SCAN_JSON="$(aws ecr describe-image-scan-findings \
  --region "${AWS_REGION}" --repository-name "${REPOSITORY}" \
  --image-id "imageDigest=${PLATFORM_DIGEST}" --output json 2>/dev/null || true)"
if ! jq -e . >/dev/null 2>&1 <<<"${SCAN_JSON}"; then
  SCAN_JSON='{}'
fi
if [[ "$(jq -r '.imageScanStatus.status // empty' <<<"${SCAN_JSON}")" != "COMPLETE" ]]; then
  aws ecr start-image-scan --region "${AWS_REGION}" --repository-name "${REPOSITORY}" \
    --image-id "imageDigest=${PLATFORM_DIGEST}" >/dev/null
  for _ in {1..60}; do
    SCAN_JSON="$(aws ecr describe-image-scan-findings \
      --region "${AWS_REGION}" --repository-name "${REPOSITORY}" \
      --image-id "imageDigest=${PLATFORM_DIGEST}" --output json 2>/dev/null || true)"
    if ! jq -e . >/dev/null 2>&1 <<<"${SCAN_JSON}"; then
      SCAN_JSON='{}'
    fi
    [[ "$(jq -r '.imageScanStatus.status // empty' <<<"${SCAN_JSON}")" == "COMPLETE" ]] && break
    sleep 5
  done
fi
[[ "$(jq -r '.imageScanStatus.status // empty' <<<"${SCAN_JSON}")" == "COMPLETE" ]] || { echo "ECR scan did not complete" >&2; exit 1; }
ECR_CRITICAL="$(jq -r '.imageScanFindings.findingSeverityCounts.CRITICAL // 0' <<<"${SCAN_JSON}")"
ECR_HIGH="$(jq -r '.imageScanFindings.findingSeverityCounts.HIGH // 0' <<<"${SCAN_JSON}")"
[[ "${ECR_CRITICAL}" -eq 0 && "${ECR_HIGH}" -eq 0 ]] || { echo "ECR scan failed: critical=${ECR_CRITICAL} high=${ECR_HIGH}" >&2; exit 1; }

# Do not use --ignore-unfixed: an unfixed critical/high remains an unresolved
# release risk and needs an explicit, reviewed exception rather than hiding it.
if [[ "${TRIVY_BIN}" == docker* ]]; then
  # When using Docker, add AWS credential environment variables
  docker run --rm \
    -v ~/.aws:/root/.aws:ro \
    -e AWS_ACCESS_KEY_ID \
    -e AWS_SECRET_ACCESS_KEY \
    -e AWS_SESSION_TOKEN \
    -e AWS_REGION \
    aquasec/trivy:latest image --platform "${PLATFORM}" --scanners vuln \
    --severity CRITICAL,HIGH --exit-code 1 --no-progress "${IMAGE}"
else
  "${TRIVY_BIN}" image --platform "${PLATFORM}" --scanners vuln \
    --severity CRITICAL,HIGH --exit-code 1 --no-progress "${IMAGE}"
fi

SBOM="$(docker buildx imagetools inspect --format '{{json .SBOM}}' "${IMAGE}")"
PROVENANCE="$(docker buildx imagetools inspect --format '{{json .Provenance}}' "${IMAGE}")"
[[ -n "${SBOM}" && "${SBOM}" != "null" && "${SBOM}" != "{}" ]] || { echo "SBOM attestation cannot be decoded" >&2; exit 1; }
[[ -n "${PROVENANCE}" && "${PROVENANCE}" != "null" && "${PROVENANCE}" != "{}" ]] || { echo "provenance attestation cannot be decoded" >&2; exit 1; }

# Publishers put these exact revisions in OCI labels. BuildKit records build
# labels in provenance, so an unrelated digest cannot be promoted merely by
# running this helper from a clean checkout.
jq -e --arg revision "${EXPECTED_SOURCE_COMMIT}" '.. | strings | select(. == $revision)' \
  >/dev/null <<<"${PROVENANCE}" || { echo "provenance does not bind source commit" >&2; exit 1; }
if [[ "${SERVICE}" == "lore" ]]; then
  jq -e --arg revision "${EXPECTED_PACKAGING_COMMIT}" '.. | strings | select(. == $revision)' \
    >/dev/null <<<"${PROVENANCE}" || { echo "provenance does not bind Lore packaging commit" >&2; exit 1; }
else
  jq -e --arg revision "${EXPECTED_PROTOCOL_COMMIT}" '.. | strings | select(. == $revision)' \
    >/dev/null <<<"${PROVENANCE}" || { echo "provenance does not bind protocol commit" >&2; exit 1; }
fi

SIGNATURE_VERIFIED=false
if [[ "${REQUIRE_SIGNATURE}" == "true" ]]; then
  command -v cosign >/dev/null || { echo "cosign is required when REQUIRE_SIGNATURE=true" >&2; exit 2; }
  : "${COSIGN_KEY:?Set COSIGN_KEY to the trusted public key or KMS URI}"
  cosign verify --key "${COSIGN_KEY}" "${IMAGE}" >/dev/null
  SIGNATURE_VERIFIED=true
fi

ECR_COMPLETED_AT="$(jq -r '.imageScanFindings.imageScanCompletedAt' <<<"${SCAN_JSON}")"
# Get trivy version - handle both local binary and Docker container
if [[ "${TRIVY_BIN}" == docker* ]]; then
  TRIVY_VERSION="$(docker run --rm aquasec/trivy:latest --version | awk 'NR == 1 { print $2 }')"
else
  TRIVY_VERSION="$(${TRIVY_BIN} --version | awk 'NR == 1 { print $2 }')"
fi
node "${SCRIPT_DIR}/record-verified-image.mjs" "${SERVICE}" "${IMAGE}" "${PLATFORM}" \
  "${PLATFORM_DIGEST}" "${ECR_COMPLETED_AT}" "${TRIVY_VERSION}" "${SIGNATURE_VERIFIED}" \
  "${EXPECTED_SOURCE_COMMIT}" true "${EXPECTED_PACKAGING_COMMIT}" "${EXPECTED_PROTOCOL_COMMIT}"

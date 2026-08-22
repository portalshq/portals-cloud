#!/usr/bin/env bash
# Verify a runnable platform image, then atomically bind the immutable index pin
# to its evidence receipt. A failed check leaves versions.yaml unchanged.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

SERVICE="${1:?usage: verify-and-promote-image.sh <service> <image@sha256> [linux/arm64]}"
IMAGE="${2:?usage: verify-and-promote-image.sh <service> <image@sha256> [linux/arm64]}"
PLATFORM="${3:-linux/arm64}"
TRIVY_BIN="${TRIVY_BIN:-}"
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

# ---------------------------------------------------------------------------
# Scanner selection — containerized by default (no host install).
# A binary name or image reference never contains whitespace; reject poisoned
# values (e.g. an exported 'docker run …' command string) loudly.
# ---------------------------------------------------------------------------
case "${TRIVY_BIN:-}" in
  *[[:space:]]*)
    echo "TRIVY_BIN contains whitespace and cannot be executed safely:" >&2
    echo "  '${TRIVY_BIN}'" >&2
    echo "Unset it (the containerized scanner is the default) or set it to a single binary path / image reference." >&2
    exit 2 ;;
esac
TRIVY_IMAGE="${TRIVY_IMAGE:-aquasec/trivy:latest}"
if [[ -z "${TRIVY_BIN}" ]]; then
  if command -v trivy >/dev/null 2>&1; then
    TRIVY_BIN="trivy"
  else
    TRIVY_BIN="${TRIVY_IMAGE}"
    echo "No native trivy found; using containerized scanner (${TRIVY_IMAGE})"
  fi
fi

# --- Helpers (defined before use) ------------------------------------------
docker_trivy_transit_guard() {
  local endpoint
  endpoint="$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null || true)"
  endpoint="${endpoint:-${DOCKER_HOST:-}}"
  case "${endpoint}" in
    ""|unix://*|npipe://*|ssh://*) : ;;
    tcp://*|http://*)
      echo "Refusing to inject AWS credentials over unencrypted docker endpoint '${endpoint}'." >&2
      echo "Use a local daemon, an ssh:// context, or a TLS-configured context." >&2
      exit 2 ;;
    *) : ;; # https:// and desktop-specific schemes
  esac
}

resolve_trivy_credentials() {
  # Resolve AWS credentials on the host; print KEY=VALUE lines on stdout.
  # Values never appear in argv, logs, or files on disk. Order:
  #   1. already-exported session environment (SSO / assume-role chains)
  #   2. aws configure export-credentials for the active profile
  local key secret token exported
  if [[ -n "${AWS_ACCESS_KEY_ID:-}" && -n "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
    key="${AWS_ACCESS_KEY_ID}"; secret="${AWS_SECRET_ACCESS_KEY}"; token="${AWS_SESSION_TOKEN:-}"
  else
    exported="$(aws configure export-credentials \
                  ${AWS_PROFILE:+--profile "${AWS_PROFILE}"} \
                  --format env-no-export 2>/dev/null || true)"
    key="$(sed -n 's/^AWS_ACCESS_KEY_ID=//p' <<<"${exported}")"
    secret="$(sed -n 's/^AWS_SECRET_ACCESS_KEY=//p' <<<"${exported}")"
    token="$(sed -n 's/^AWS_SESSION_TOKEN=//p' <<<"${exported}")"
  fi
  if [[ -z "${key}" || -z "${secret}" ]]; then
    echo "No usable AWS credentials for the containerized Trivy scanner:" >&2
    echo "export AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY (plus AWS_SESSION_TOKEN for temporary sessions)" >&2
    echo "or configure ~/.aws for profile '${AWS_PROFILE:-default}' so 'aws configure export-credentials' succeeds." >&2
    return 1
  fi
  printf 'AWS_ACCESS_KEY_ID=%s\n' "${key}"
  printf 'AWS_SECRET_ACCESS_KEY=%s\n' "${secret}"
  [[ -n "${token}" ]] && printf 'AWS_SESSION_TOKEN=%s\n' "${token}"
  printf 'AWS_REGION=%s\nAWS_DEFAULT_REGION=%s\n' "${AWS_REGION}" "${AWS_REGION}"
}

# Reviewed, expiring vulnerability exceptions (fail-closed: expired entries
# grant nothing). Enforced identically on the ECR recount below and on the
# Trivy results client-side. Package/reason fields are review metadata only.
EXCEPTIONS_FILE="${SCRIPT_DIR}/trivy-exceptions.json"
TODAY="$(date -u +%Y-%m-%d)"
ACTIVE_EXCEPTION_IDS="$(jq -r --arg today "${TODAY}" \
  '[.exceptions[] | select(.expires >= $today) | .id] | join(" ")' \
  "${EXCEPTIONS_FILE}" 2>/dev/null || echo "")"
echo "Active vulnerability exceptions: ${ACTIVE_EXCEPTION_IDS:-none}"

# --- Preflight --------------------------------------------------------------
if [[ "${TRIVY_BIN}" == *:* ]]; then
  echo "Using trivy via Docker container (${TRIVY_BIN})"
  docker pull "${TRIVY_BIN}" >/dev/null 2>&1 || { echo "Failed to pull trivy Docker image" >&2; exit 2; }
elif command -v "${TRIVY_BIN}" >/dev/null 2>&1; then
  : # native binary or custom path
else
  echo "Trivy is required; refusing to promote without an independent scan" >&2
  exit 2
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
  # scanOnPush repositories auto-start a scan on push; an explicit re-start
  # hits the per-image quota (LimitExceededException). Either way a scan is
  # running or complete — fall through to the findings poll.
  aws ecr start-image-scan --region "${AWS_REGION}" --repository-name "${REPOSITORY}" \
    --image-id "imageDigest=${PLATFORM_DIGEST}" >/dev/null 2>&1 || \
    echo "start-image-scan skipped (already started via scanOnPush or quota); polling findings"
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
if [[ -n "${ACTIVE_EXCEPTION_IDS// /|}" ]]; then
  EC_RE="^($(echo "${ACTIVE_EXCEPTION_IDS}" | sed 's/ /|/g'))$"
  FILTERED_JSON="$(jq --arg re "${EC_RE}" \
    '{imageScanFindings: {findings: [.imageScanFindings.findings[]? | select((.name | test($re)) | not)]}}' \
    <<<"${SCAN_JSON}")"
else
  FILTERED_JSON="${SCAN_JSON}"
fi
ECR_CRITICAL="$(jq -r '[.imageScanFindings.findings[]? | select(.severity == "CRITICAL")] | length' <<<"${FILTERED_JSON}")"
ECR_HIGH="$(jq -r '[.imageScanFindings.findings[]? | select(.severity == "HIGH")] | length' <<<"${FILTERED_JSON}")"
[[ "${ECR_CRITICAL}" -eq 0 && "${ECR_HIGH}" -eq 0 ]] || { echo "ECR scan failed after exceptions: critical=${ECR_CRITICAL} high=${ECR_HIGH}" >&2; exit 1; }
# Do not use --ignore-unfixed: an unfixed critical/high remains an unresolved
# release risk and needs an explicit, reviewed exception rather than hiding it.
# The container receives ONLY the image ref and a creds env-file; all policy
# (exception allowlist, severity gate) is evaluated client-side below, so no
# host paths are ever shared with the daemon.
scan_failed=0
if [[ "${TRIVY_BIN}" == *:* ]]; then
  docker_trivy_transit_guard
  TRIVY_CREDS="$(mktemp "${TMPDIR:-/tmp}/trivy-creds.XXXXXX")"
  chmod 600 "${TRIVY_CREDS}"
  resolve_trivy_credentials > "${TRIVY_CREDS}" || { rm -f "${TRIVY_CREDS}"; exit 2; }
  TRIVY_JSON="$(mktemp "${TMPDIR:-/tmp}/trivy-scan.XXXXXX")"

  docker_rc=0
  docker run --rm --env-file "${TRIVY_CREDS}" \
    "${TRIVY_BIN}" image --platform "${PLATFORM}" --scanners vuln \
    --severity CRITICAL,HIGH --format json --no-progress \
    "${IMAGE}" > "${TRIVY_JSON}" || docker_rc=$?
  shred -u "${TRIVY_CREDS}" 2>/dev/null || rm -f "${TRIVY_CREDS}"
  [[ "${docker_rc}" -eq 0 ]] || { rm -f "${TRIVY_JSON}"; exit "${docker_rc}"; }
  [[ -s "${TRIVY_JSON}" ]] || { rm -f "${TRIVY_JSON}"; echo "Trivy produced empty JSON output" >&2; exit 1; }
  if ! jq -e 'type == "object" and (.Results | type == "array")' \
    < "${TRIVY_JSON}" >/dev/null; then
    rm -f "${TRIVY_JSON}"
    echo "Trivy produced invalid JSON output; refusing to promote" >&2
    exit 1
  fi

  TRIVY_RE="^(${ACTIVE_EXCEPTION_IDS// /|})$"
  REMAINING_JSON="$(jq --arg re "${TRIVY_RE}" \
    '[.Results[]?.Vulnerabilities[]? | select((.VulnerabilityID | test($re)) | not)]' \
    < "${TRIVY_JSON}")"
  TRIVY_CRITICAL="$(jq -r '[.[] | select(.Severity == "CRITICAL")] | length' <<<"${REMAINING_JSON}")"
  TRIVY_HIGH="$(jq -r '[.[] | select(.Severity == "HIGH")] | length' <<<"${REMAINING_JSON}")"
  rm -f "${TRIVY_JSON}"
  TRIVY_CRITICAL="${TRIVY_CRITICAL:-0}"; TRIVY_HIGH="${TRIVY_HIGH:-0}"

  if [[ "${TRIVY_CRITICAL}" -eq 0 && "${TRIVY_HIGH}" -eq 0 ]]; then
    echo "Trivy: 0 critical/high after reviewed exceptions."
  else
    echo "Trivy found unresolved critical/high findings after exceptions:" >&2
    jq -r '.[] | "\(.Severity)\t\(.VulnerabilityID)\t\(.PkgName)"' <<<"${REMAINING_JSON}" >&2
    scan_failed=1
  fi
else
  "${TRIVY_BIN}" image --platform "${PLATFORM}" --scanners vuln \
    --severity CRITICAL,HIGH --exit-code 1 --no-progress "${IMAGE}" || scan_failed=$?
fi
[[ "${scan_failed}" -eq 0 ]] || exit "${scan_failed}"

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
if [[ "${TRIVY_BIN}" == *:* ]]; then
  TRIVY_VERSION="$(docker run --rm "${TRIVY_BIN}" --version | awk 'NR == 1 { print $2 }')"
else
  TRIVY_VERSION="$(${TRIVY_BIN} --version | awk 'NR == 1 { print $2 }')"
fi
node "${SCRIPT_DIR}/record-verified-image.mjs" "${SERVICE}" "${IMAGE}" "${PLATFORM}" \
  "${PLATFORM_DIGEST}" "${ECR_COMPLETED_AT}" "${TRIVY_VERSION}" "${SIGNATURE_VERIFIED}" \
  "${EXPECTED_SOURCE_COMMIT}" true "${EXPECTED_PACKAGING_COMMIT}" "${EXPECTED_PROTOCOL_COMMIT}"

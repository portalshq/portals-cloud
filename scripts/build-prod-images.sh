#!/usr/bin/env bash
# Build and publish production Lore and Auth Gateway images
# This script sets all required environment variables and runs both build scripts
#
# Usage: ./build-prod-images.sh [--prod|--multiarch]
#   --prod      : Single-arch (arm64) cross-compiled build for production (default)
#   --multiarch : Multi-arch (amd64 + arm64) build for CI/testing

set -euo pipefail

export AWS_REGION="${AWS_REGION:-us-east-1}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Load local configuration from an untracked .env file.
# Real environment variables take precedence over values from the file.
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/.env}"
if [[ -f "${ENV_FILE}" ]]; then
  echo "Loading configuration from ${ENV_FILE}"
  while IFS='=' read -r key value; do
    value="${value%$'\r'}"
    [[ -z "${key}" || "${key}" == \#* ]] && continue
    [[ "${key}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    if [[ -z "${!key+x}" ]]; then
      export "${key}=${value}"
    fi
  done < "${ENV_FILE}"
fi

# Parse build mode argument
BUILD_MODE="${1:-prod}"
if [[ "${BUILD_MODE}" != "prod" && "${BUILD_MODE}" != "multiarch" ]]; then
  echo "Usage: $0 [--prod|--multiarch]" >&2
  exit 1
fi

# Infrastructure identifiers must come from the environment or .env (no inline defaults)
: "${ECR_REGISTRY:?Set ECR_REGISTRY in your environment or ${REPO_ROOT}/.env}"
: "${COSIGN_KEY:?Set COSIGN_KEY in your environment or ${REPO_ROOT}/.env}"
: "${ECR_NAMESPACE:?Set ECR_NAMESPACE in your environment or ${REPO_ROOT}/.env}"

# Safe generic defaults
ENVIRONMENT="${ENVIRONMENT:-prod}"
REQUIRE_SIGNATURE="${REQUIRE_SIGNATURE:-true}"

# Separate architecture configuration for each service
LORE_TARGETARCH="${LORE_TARGETARCH:-arm64}"
AUTH_TARGETARCH="${AUTH_TARGETARCH:-arm64}"

# Note: BUILD_ID is generated inside individual build scripts, not here.
# This ensures each build attempt (including retries) gets a unique identifier,
# preventing ECR tag conflicts when the retry logic is triggered.

# For backward compatibility, if TARGETARCH is set, use it for both
if [[ -n "${TARGETARCH:-}" ]]; then
  echo "TARGETARCH is deprecated; use LORE_TARGETARCH and AUTH_TARGETARCH instead"
  LORE_TARGETARCH="${TARGETARCH}"
  AUTH_TARGETARCH="${TARGETARCH}"
fi

# Set platforms based on build mode
if [[ "${BUILD_MODE}" == "prod" ]]; then
  PLATFORMS="linux/${LORE_TARGETARCH}"
  AUTH_PLATFORMS="linux/${AUTH_TARGETARCH}"
  echo "=== PRODUCTION MODE: Single-arch cross-compiled (${LORE_TARGETARCH}) ==="
else
  PLATFORMS="linux/amd64,linux/arm64"
  AUTH_PLATFORMS="linux/amd64,linux/arm64"
  echo "=== MULTI-ARCH MODE: ${PLATFORMS} ==="
fi

# Export environment variables
export ECR_REGISTRY
export ENVIRONMENT
export REQUIRE_SIGNATURE
export COSIGN_KEY
export ECR_NAMESPACE
export PLATFORMS
export AUTH_PLATFORMS
export LORE_TARGETARCH
export AUTH_TARGETARCH
export TARGETARCH  # For backward compatibility

echo "=== Production Image Build Configuration ==="
echo "ECR Registry: ${ECR_REGISTRY}"
echo "Environment: ${ENVIRONMENT}"
echo "ECR Namespace: ${ECR_NAMESPACE}"
echo "Platforms: ${PLATFORMS}"
echo "Lore Target Architecture: ${LORE_TARGETARCH}"
echo "Auth Gateway Target Architecture: ${AUTH_TARGETARCH}"
echo "Require Signature: ${REQUIRE_SIGNATURE}"
echo "Cosign Key: ${COSIGN_KEY}"
echo ""

# Check prerequisites
command -v docker >/dev/null || { echo "docker is required" >&2; exit 1; }
command -v cosign >/dev/null || { echo "cosign is required (install: https://docs.sigstore.dev/cosign/installation/)" >&2; exit 1; }

# Use trivy via Docker if not available locally
if command -v trivy >/dev/null 2>&1; then
  export TRIVY_BIN="trivy"
else
  echo "trivy not found locally, using Docker container for vulnerability scanning"
  # Mount AWS credentials and region for ECR access
  export TRIVY_BIN="docker run --rm \
    -v ~/.aws:/root/.aws:ro \
    -e AWS_ACCESS_KEY_ID \
    -e AWS_SECRET_ACCESS_KEY \
    -e AWS_SESSION_TOKEN \
    -e AWS_REGION \
    aquasec/trivy:latest"
fi

# Check AWS credentials
aws sts get-caller-identity >/dev/null 2>&1 || { echo "AWS credentials not configured" >&2; exit 1; }

# Check KMS key access (only applies to awskms:// key references)
if [[ "${COSIGN_KEY}" == awskms:///* ]]; then
  aws kms describe-key --key-id "${COSIGN_KEY#awskms:///}" --region "${AWS_REGION}" >/dev/null 2>&1 || { echo "Cannot access artifact-signing KMS key (${COSIGN_KEY})" >&2; exit 1; }
fi

# ECR login (guarded, idempotent; tokens expire ~12h)
echo "=== Logging into ECR ==="
aws ecr get-login-password --region "${AWS_REGION}" | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

# Retry wrapper: 3 attempts, 10s backoff
retry() {
  local max_attempts=3
  local attempt=1
  local cmd=("$@")
  while true; do
    if "${cmd[@]}"; then
      return 0
    fi
    local rc=$?
    if (( attempt >= max_attempts )); then
      echo "Command failed after ${max_attempts} attempts: ${cmd[*]}" >&2
      return ${rc}
    fi
    echo "Attempt ${attempt} failed (rc=${rc}); retrying in 10s..." >&2
    sleep 10
    ((attempt++))
  done
}

echo "=== Building Lore Server Image ==="
cd "${REPO_ROOT}"
retry ./infra/lore/scripts/docker-buildx-lore.sh
echo ""

echo "=== Building Auth Gateway Image ==="
cd "${REPO_ROOT}/control-plane"
retry ./scripts/publish-auth-gateway.sh
echo ""

echo "=== Build Complete ==="
echo "Updated versions.yaml:"
cat "${REPO_ROOT}/infra/lore/versions.yaml"
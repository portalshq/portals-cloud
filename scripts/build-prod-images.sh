#!/usr/bin/env bash
# Build and publish production Lore and Auth Gateway images
# This script sets all required environment variables and runs both build scripts

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Default values
ECR_REGISTRY="${ECR_REGISTRY:-907199504810.dkr.ecr.us-east-1.amazonaws.com}"
ENVIRONMENT="${ENVIRONMENT:-prod}"
REQUIRE_SIGNATURE="${REQUIRE_SIGNATURE:-true}"
COSIGN_KEY="${COSIGN_KEY:-aws-kms://alias/portals-artifact-signing}"
ECR_NAMESPACE="${ECR_NAMESPACE:-portals-prod}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
TARGETARCH="${TARGETARCH:-arm64}"

# Export environment variables
export ECR_REGISTRY
export ENVIRONMENT
export REQUIRE_SIGNATURE
export COSIGN_KEY
export ECR_NAMESPACE
export PLATFORMS
export TARGETARCH

echo "=== Production Image Build Configuration ==="
echo "ECR Registry: ${ECR_REGISTRY}"
echo "Environment: ${ENVIRONMENT}"
echo "ECR Namespace: ${ECR_NAMESPACE}"
echo "Platforms: ${PLATFORMS}"
echo "Target Architecture: ${TARGETARCH}"
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

# Check KMS key access
aws kms describe-key --key-id alias/portals-artifact-signing --region us-east-1 >/dev/null 2>&1 || { echo "Cannot access artifact-signing KMS key" >&2; exit 1; }

echo "=== Building Lore Server Image ==="
cd "${REPO_ROOT}"
./infra/lore/scripts/docker-buildx-lore.sh
echo ""

echo "=== Building Auth Gateway Image ==="
cd "${REPO_ROOT}/control-plane"
./scripts/publish-auth-gateway.sh
echo ""

echo "=== Build Complete ==="
echo "Updated versions.yaml:"
cat "${REPO_ROOT}/infra/lore/versions.yaml"

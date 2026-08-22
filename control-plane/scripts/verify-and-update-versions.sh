#!/usr/bin/env bash
# Verify that the Control Plane image actually running in ECS matches the
# version pinned in infra/lore/versions.yaml, and optionally correct the pin
# after manual deploys.
#
# Usage:
#   ./scripts/verify-and-update-versions.sh [environment]           # read-only
#   ./scripts/verify-and-update-versions.sh [environment] --write   # fix drift
#
# Optional env vars:
#   PROJECT_NAME   Project prefix used in resource names (default: portals)
#
# Exit codes:
#   0  in sync (or drift corrected with --write)
#   1  drift detected (read-only mode)
#   2  error (versions.yaml unset, stack not deployed, AWS call failed)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VERSIONS_FILE="$ROOT/infra/lore/versions.yaml"
UPDATE_PIN_SCRIPT="$ROOT/infra/pulumi/scripts/update-version-pin.mjs"

PROJECT_NAME="${PROJECT_NAME:-portals}"
ENVIRONMENT="${1:-dev}"
WRITE="${2:-}"

# ── Read the pinned image from versions.yaml ────────────────────────────────
PINNED="$(node "$UPDATE_PIN_SCRIPT" get control-plane image)"

if [[ -z "$PINNED" ]]; then
    echo "ERROR: control-plane.image is not set in ${VERSIONS_FILE}" >&2
    exit 2
fi

# ── Resolve what is actually running in ECS ─────────────────────────────────
CLUSTER="${PROJECT_NAME}-${ENVIRONMENT}-cluster"
SERVICE="${PROJECT_NAME}-${ENVIRONMENT}-controlplane-service"

TASK_DEF="$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
    --query 'services[0].deployments[?status==`PRIMARY`] | [0].taskDefinition' --output text 2>/dev/null || true)"
if [[ -z "$TASK_DEF" || "$TASK_DEF" == "None" ]]; then
    # Fallback to the first deployment if no PRIMARY is reported yet.
    TASK_DEF="$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
        --query 'services[0].deployments[0].taskDefinition' --output text 2>/dev/null || true)"
fi
if [[ -z "$TASK_DEF" || "$TASK_DEF" == "None" ]]; then
    echo "ERROR: service ${SERVICE} not found in cluster ${CLUSTER} (is the stack deployed?)" >&2
    exit 2
fi

DEPLOYED="$(aws ecs describe-task-definition --task-definition "$TASK_DEF" \
    --query 'taskDefinition.containerDefinitions[0].image' --output text)"

# ECS can rewrite the image reference; normalize by dropping any @digest suffix.
normalize() { printf '%s' "$1" | sed 's/@sha256:.*//'; }

if [[ "$(normalize "$PINNED")" == "$(normalize "$DEPLOYED")" ]]; then
    echo "OK: deployed control-plane image matches versions.yaml"
    echo "    ${PINNED}"
    exit 0
fi

echo "DRIFT: deployed control-plane image differs from versions.yaml" >&2
echo "    pinned:   ${PINNED}" >&2
echo "    deployed: ${DEPLOYED}" >&2

if [[ "$WRITE" == "--write" ]]; then
    echo ""
    echo "==> Updating ${VERSIONS_FILE} to the deployed image"
    node "$UPDATE_PIN_SCRIPT" set control-plane image "$DEPLOYED"
    echo "OK: versions.yaml now matches what is deployed"
    exit 0
fi

echo ""
echo "Re-run with --write to update versions.yaml (e.g. after a manual deploy)," >&2
echo "or run publish-image.sh + pulumi up to deploy the pinned version." >&2
exit 1

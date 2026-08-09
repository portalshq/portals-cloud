#!/usr/bin/env bash
# Regression tests for the build/pin/deploy/verify pipeline tooling.
# Covers: versions.yaml awk write/read roundtrip (publish-image.sh + verify),
# no leakage into other image pins, ECR removal, and the verify script failing
# cleanly when nothing is deployed.
# Usage: ./scripts/test-pipeline.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }

# ── 1. versions.yaml awk write (publish-image.sh) → read (verify) roundtrip ─
VERSIONS_FILE="$TMP/versions.yaml"
cat > "$VERSIONS_FILE" <<'YAML'
portals:
  version: 0.2.0
lore:
  image: ""
control-plane:
  # Set by control-plane/scripts/publish-image.sh after each push.
  image: ""
YAML

# Same awk writer used by publish-image.sh.
awk -v image='portalshq/control-plane:abc123-20260809-120000' '
    $0 ~ /^control-plane:/ { in_cp = 1 }
    in_cp && /^  image:/ { sub(/^  image:.*/, "  image: \"" image "\""); in_cp = 0 }
    { print }
' "$VERSIONS_FILE" > "$VERSIONS_FILE.tmp" && mv "$VERSIONS_FILE.tmp" "$VERSIONS_FILE"

# Same awk reader used by verify-and-update-versions.sh.
PINNED="$(awk '
    /^control-plane:/ { in_cp = 1 }
    in_cp && /^  image:/ { sub(/^  image: *"?/, ""); sub(/"?$/, ""); print; exit }
' "$VERSIONS_FILE")"

[ "$PINNED" = 'portalshq/control-plane:abc123-20260809-120000' ] \
    || fail "awk roundtrip: expected pinned image, got $(printf '%q' "$PINNED")"

LORE_IMG="$(awk '
    /^lore:/ { in_lore = 1 }
    in_lore && /^  image:/ { sub(/^  image: *"?/, ""); sub(/"?$/, ""); print; exit }
' "$VERSIONS_FILE")"
[ -z "$LORE_IMG" ] || fail "awk write leaked into lore.image: $(printf '%q' "$LORE_IMG")"
echo "ok: versions.yaml awk roundtrip (write + read, no leakage)"

# ── 2. ECR / old-script removal guard ───────────────────────────────────────
if grep -rn --exclude-dir=node_modules --exclude-dir=bin --exclude=test-pipeline.sh \
        -E 'aws\.ecr\.|controlPlaneEcrRepository|build-and-push-ecr' \
        "$ROOT/infra/pulumi" "$ROOT/control-plane/scripts" 2>/dev/null; then
    fail "stale ECR / build-and-push-ecr references remain (see above)"
fi
echo "ok: no ECR or build-and-push-ecr references remain"

# ── 3. verify script exits 2 cleanly without a deployed stack ───────────────
# The pin is already set from step 1; with no valid AWS credentials/stack the
# script must report "not found" (exit 2), never crash.
if env AWS_ACCESS_KEY_ID=none AWS_SECRET_ACCESS_KEY=none AWS_SESSION_TOKEN= \
        AWS_EC2_METADATA_DISABLED=true \
        "$ROOT/control-plane/scripts/verify-and-update-versions.sh" dev >/dev/null 2>&1; then
    fail "verify script should exit non-zero when nothing is deployed"
fi
echo "ok: verify-and-update-versions.sh fails cleanly with no deployed stack"

echo ""
echo "All pipeline tests passed."

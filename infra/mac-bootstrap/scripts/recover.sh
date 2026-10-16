#!/bin/sh
set -eu

manifest=${RECOVERY_MANIFEST:?RECOVERY_MANIFEST is required}
isolation=${RECOVERY_ISOLATION_DIR:?RECOVERY_ISOLATION_DIR is required}
test -f "$manifest" && test -r "$manifest" || { echo 'Recovery manifest is unreadable' >&2; exit 1; }
isolation=$(CDPATH= cd -- "$isolation" 2>/dev/null && pwd || { mkdir -p "$isolation"; CDPATH= cd -- "$isolation" && pwd; })
case "$(CDPATH= cd -- "$(dirname -- "$manifest")" && pwd)" in
  "$isolation"/*) echo 'Recovery manifest must be outside the isolation target' >&2; exit 1 ;;
esac
mkdir -p "$isolation"
test -w "$isolation" || { echo 'Recovery isolation target is not writable' >&2; exit 1; }
case "$manifest" in
  *.json)
    command -v jq >/dev/null || { echo 'jq is required for JSON recovery manifests' >&2; exit 1; }
    jq -e '.architecture == "mac-amd64" and (.services | index("auth-gateway")) and (.services | index("lore"))' "$manifest" >/dev/null \
      || { echo 'Recovery manifest is missing the required Mac services' >&2; exit 1; }
    ;;
  *.yaml|*.yml) : ;;
  *) echo 'RECOVERY_MANIFEST must be JSON or YAML' >&2; exit 1 ;;
esac
evidence="$isolation/recovery-evidence-$(date -u +%Y%m%dT%H%M%SZ).txt"
{
  echo "manifest=$manifest"
  echo "isolation=$isolation"
  echo "validated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo 'provider_restore=manual-required'
  echo 'public_ingress=disabled-until-validation'
} > "$evidence"
chmod 600 "$evidence"
echo "Recovery target validated; restore providers into isolation, run checks, then deploy: $evidence"

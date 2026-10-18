#!/bin/sh
set -eu

# One-time, checksum-guarded refresh of the service-owned read-only gate tools.
# This runs as root only when explicitly authorized in an administrator shell.
ROOT=/Users/portals-svc/portals/infra/mac-bootstrap
CHECK_RELEASE=$ROOT/scripts/check-release.mjs
GATE=$ROOT/scripts/remote-ops-gate.sh
STAGED_CHECK_RELEASE=/Users/Shared/portals-check-release-20261016.mjs
STAGED_GATE=/Users/Shared/portals-remote-ops-gate-20261016c.sh
OLD_CHECK_RELEASE_SHA256=3c97daa1d12581df5c75d009306a2fbc7d295605b357e175a8ae6725a1f8fe7a
NEW_CHECK_RELEASE_SHA256=96130a51e0aa3a312eda75c9754a8dc09df347dcb49eb4ba205bd535ef093c92
OLD_GATE_SHA256=5476bde51eaccee32d3cb26d02ac0482ba89c3b65206a9a3f751522aeb3da0e2
NEW_GATE_SHA256=f39c9e068a467cc998521adc04eac15601ffa8af4d182e8138fa1df5bd6a137d

[ "$(id -u)" -eq 0 ] || { echo 'Run this installer through sudo.' >&2; exit 1; }
for file in "$STAGED_CHECK_RELEASE" "$STAGED_GATE"; do
  [ -f "$file" ] && [ ! -L "$file" ] || { echo "Staged file missing or unsafe: $file" >&2; exit 1; }
done
check_sha=$(/usr/bin/shasum -a 256 "$STAGED_CHECK_RELEASE" | /usr/bin/awk '{print $1}')
gate_sha=$(/usr/bin/shasum -a 256 "$STAGED_GATE" | /usr/bin/awk '{print $1}')
[ "$check_sha" = "$NEW_CHECK_RELEASE_SHA256" ] || { echo 'Staged release validator checksum mismatch.' >&2; exit 1; }
[ "$gate_sha" = "$NEW_GATE_SHA256" ] || { echo 'Staged status helper checksum mismatch.' >&2; exit 1; }
[ -f "$CHECK_RELEASE" ] && [ ! -L "$CHECK_RELEASE" ] || { echo 'Installed release validator is unavailable.' >&2; exit 1; }
[ -f "$GATE" ] && [ ! -L "$GATE" ] || { echo 'Installed status helper is unavailable.' >&2; exit 1; }
old_check_sha=$(/usr/bin/shasum -a 256 "$CHECK_RELEASE" | /usr/bin/awk '{print $1}')
old_gate_sha=$(/usr/bin/shasum -a 256 "$GATE" | /usr/bin/awk '{print $1}')
[ "$old_check_sha" = "$OLD_CHECK_RELEASE_SHA256" ] || [ "$old_check_sha" = "$NEW_CHECK_RELEASE_SHA256" ] || { echo 'Installed release validator differs from expected versions; refusing to overwrite.' >&2; exit 1; }
[ "$old_gate_sha" = "$OLD_GATE_SHA256" ] || [ "$old_gate_sha" = "$NEW_GATE_SHA256" ] || { echo 'Installed status helper differs from expected versions; refusing to overwrite.' >&2; exit 1; }

check_tmp=$(/usr/bin/mktemp "$ROOT/scripts/check-release.XXXXXX")
gate_tmp=$(/usr/bin/mktemp "$ROOT/scripts/remote-ops-gate.XXXXXX")
trap '/bin/rm -f "${check_tmp:-}" "${gate_tmp:-}"' EXIT HUP INT TERM
/bin/cp "$STAGED_CHECK_RELEASE" "$check_tmp"
/bin/cp "$STAGED_GATE" "$gate_tmp"
/usr/sbin/chown portals-svc:staff "$check_tmp" "$gate_tmp"
/bin/chmod 0644 "$check_tmp"
/bin/chmod 0500 "$gate_tmp"
/bin/mv "$check_tmp" "$CHECK_RELEASE"
/bin/mv "$gate_tmp" "$GATE"
trap - EXIT HUP INT TERM

[ "$(/usr/bin/shasum -a 256 "$CHECK_RELEASE" | /usr/bin/awk '{print $1}')" = "$NEW_CHECK_RELEASE_SHA256" ] || { echo 'Installed release validator checksum mismatch.' >&2; exit 1; }
[ "$(/usr/bin/shasum -a 256 "$GATE" | /usr/bin/awk '{print $1}')" = "$NEW_GATE_SHA256" ] || { echo 'Installed status helper checksum mismatch.' >&2; exit 1; }
echo 'REMOTE_OPS_TOOLS_UPDATED: checksum-verified status and preflight tools installed; no configuration or services changed.'

#!/bin/sh
set -eu

# One-time installer for the narrow fallback used when macOS refuses a
# service-account SSH session. This does not authorize any command as root.
RULE=/private/etc/sudoers.d/portals-remote-ops-gate
HELPER=/Users/portals-svc/portals/infra/mac-bootstrap/scripts/remote-ops-gate.sh
STAGED_HELPER=/Users/Shared/portals-remote-ops-gate-20261016b.sh
OLD_HELPER_SHA256=1e488ece9986cf20c16e5a3fe9d79e764ff06afd0c48b777321c7611024acabf
NEW_HELPER_SHA256=5476bde51eaccee32d3cb26d02ac0482ba89c3b65206a9a3f751522aeb3da0e2

[ "$(id -u)" -eq 0 ] || { echo 'Run this installer through sudo.' >&2; exit 1; }
[ -x "$HELPER" ] && [ ! -L "$HELPER" ] || { echo 'Restricted helper is unavailable.' >&2; exit 1; }
[ -f "$STAGED_HELPER" ] && [ ! -L "$STAGED_HELPER" ] || { echo 'Staged restricted helper is unavailable.' >&2; exit 1; }
[ "$(/usr/bin/shasum -a 256 "$STAGED_HELPER" | /usr/bin/awk '{print $1}')" = "$NEW_HELPER_SHA256" ] || { echo 'Staged helper checksum mismatch.' >&2; exit 1; }
installed_helper_sha=$(/usr/bin/shasum -a 256 "$HELPER" | /usr/bin/awk '{print $1}')
[ "$installed_helper_sha" = "$OLD_HELPER_SHA256" ] || [ "$installed_helper_sha" = "$NEW_HELPER_SHA256" ] || { echo 'Installed helper differs from expected versions; refusing to overwrite.' >&2; exit 1; }
[ -d /private/etc/sudoers.d ] || { echo 'sudoers.d is unavailable; refusing to modify the main sudoers file.' >&2; exit 1; }
/usr/bin/grep -Eq '^[[:space:]]*#includedir[[:space:]]+/private/etc/sudoers\.d([[:space:]]|$)' /private/etc/sudoers || { echo 'The system sudoers file does not include /private/etc/sudoers.d.' >&2; exit 1; }

rule_text='andresb ALL=(portals-svc) NOPASSWD: /Users/portals-svc/portals/infra/mac-bootstrap/scripts/remote-ops-gate.sh status, /Users/portals-svc/portals/infra/mac-bootstrap/scripts/remote-ops-gate.sh preflight'
if [ -e "$RULE" ]; then
  /usr/bin/grep -F -x -q "$rule_text" "$RULE" && { echo 'REMOTE_OPS_SUDOERS_ALREADY_INSTALLED'; exit 0; }
  echo 'A different remote-ops sudoers rule exists; refusing to overwrite it.' >&2
  exit 1
fi

helper_tmp=$(/usr/bin/mktemp "$(/usr/bin/dirname "$HELPER")/remote-ops-gate.XXXXXX")
trap '/bin/rm -f "${helper_tmp:-}" "${tmp:-}"' EXIT HUP INT TERM
if [ "$installed_helper_sha" = "$OLD_HELPER_SHA256" ]; then
  /bin/cp "$STAGED_HELPER" "$helper_tmp"
  /usr/sbin/chown portals-svc:staff "$helper_tmp"
  /bin/chmod -N "$helper_tmp"
  /bin/chmod 0500 "$helper_tmp"
  /bin/mv "$helper_tmp" "$HELPER"
fi

tmp=$(/usr/bin/mktemp /private/etc/sudoers.d/portals-remote-ops-gate.XXXXXX)
/usr/bin/printf '%s\n' "$rule_text" > "$tmp"
/usr/sbin/chown root:wheel "$tmp"
/bin/chmod 0440 "$tmp"
/usr/sbin/visudo -cf "$tmp" >/dev/null
/bin/mv "$tmp" "$RULE"
trap - EXIT HUP INT TERM
/usr/sbin/visudo -c >/dev/null
echo 'REMOTE_OPS_SUDOERS_INSTALLED: andresb may run only status/preflight as portals-svc without a password; root commands remain password-protected.'

#!/bin/sh
set -eu

# One-time administrator installer for the fixed Lore discovery repair action.
# It does not grant a shell or general sudo; it adds exactly one helper action.
ROOT=/Users/portals-svc/portals/infra/mac-bootstrap
HELPER=$ROOT/scripts/remote-ops-gate.sh
REPAIR=$ROOT/scripts/repair-lore-auth-discovery.mjs
DISCOVERY_CHECK=$ROOT/scripts/check-lore-discovery.mjs
CHECK=$ROOT/scripts/check-release.mjs
PROTO=$ROOT/probes/environment-v1.proto
RULE=/private/etc/sudoers.d/portals-remote-ops-gate
STAGED_HELPER=/Users/Shared/portals-remote-ops-gate-discovery-20261017.sh
STAGED_REPAIR=/Users/Shared/portals-repair-lore-auth-discovery-20261017.mjs
STAGED_DISCOVERY_CHECK=/Users/Shared/portals-check-lore-discovery-20261017.mjs
STAGED_CHECK=/Users/Shared/portals-check-release-discovery-20261017.mjs
STAGED_PROTO=/Users/Shared/portals-environment-v1-20261017.proto

OLD_HELPER_SHA=f39c9e068a467cc998521adc04eac15601ffa8af4d182e8138fa1df5bd6a137d
NEW_HELPER_SHA=950928a338824b3c4b7f760e0e60b07d79506fa79d87343cc73cbed4edb1c1f7
OLD_CHECK_SHA=96130a51e0aa3a312eda75c9754a8dc09df347dcb49eb4ba205bd535ef093c92
NEW_CHECK_SHA=53f46ad21ff45efc8838ee8ce723497caf21b0515aa254b773d3e68aeaa00cb5
NEW_REPAIR_SHA=163280b573176113ae573ef00837e454ac0ab195d5f29de771db38ffaf514799
DISCOVERY_CHECK_SHA=1ec4e72f615bdd1446677e8edbb9957d0d99507cd1fbc2c30486f8de8f970842
PROTO_SHA=da71ee1e93baa0de4cfb3dbea756548cf0030a4f1a05544d964f6f923b211f95

[ "$(id -u)" -eq 0 ] || { echo 'Run once through an authenticated Mac administrator sudo session.' >&2; exit 1; }
for file in "$STAGED_HELPER" "$STAGED_REPAIR" "$STAGED_DISCOVERY_CHECK" "$STAGED_CHECK" "$STAGED_PROTO" "$HELPER" "$CHECK"; do
  [ -f "$file" ] && [ ! -L "$file" ] || { echo "Required regular file missing or unsafe: $file" >&2; exit 1; }
done
sha() { /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}'; }
[ "$(sha "$STAGED_HELPER")" = "$NEW_HELPER_SHA" ] || { echo 'Staged gate checksum mismatch.' >&2; exit 1; }
[ "$(sha "$STAGED_REPAIR")" = "$NEW_REPAIR_SHA" ] || { echo 'Staged repair checksum mismatch.' >&2; exit 1; }
[ "$(sha "$STAGED_DISCOVERY_CHECK")" = "$DISCOVERY_CHECK_SHA" ] || { echo 'Staged discovery checker checksum mismatch.' >&2; exit 1; }
[ "$(sha "$STAGED_CHECK")" = "$NEW_CHECK_SHA" ] || { echo 'Staged validator checksum mismatch.' >&2; exit 1; }
[ "$(sha "$STAGED_PROTO")" = "$PROTO_SHA" ] || { echo 'Staged environment proto checksum mismatch.' >&2; exit 1; }
installed_helper_sha=$(sha "$HELPER")
[ "$installed_helper_sha" = "$OLD_HELPER_SHA" ] || [ "$installed_helper_sha" = "$NEW_HELPER_SHA" ] || { echo 'Installed gate differs from reviewed versions; refusing.' >&2; exit 1; }
installed_check_sha=$(sha "$CHECK")
[ "$installed_check_sha" = "$OLD_CHECK_SHA" ] || [ "$installed_check_sha" = "$NEW_CHECK_SHA" ] || { echo 'Installed validator differs from reviewed versions; refusing.' >&2; exit 1; }
[ ! -e "$REPAIR" ] || { [ -f "$REPAIR" ] && [ ! -L "$REPAIR" ] && [ "$(sha "$REPAIR")" = "$NEW_REPAIR_SHA" ]; } || { echo 'A different repair script already exists; refusing.' >&2; exit 1; }
[ ! -e "$DISCOVERY_CHECK" ] || { [ -f "$DISCOVERY_CHECK" ] && [ ! -L "$DISCOVERY_CHECK" ] && [ "$(sha "$DISCOVERY_CHECK")" = "$DISCOVERY_CHECK_SHA" ]; } || { echo 'A different Lore discovery checker already exists; refusing.' >&2; exit 1; }
[ ! -L "$ROOT/probes" ] || { echo 'Bootstrap probes directory must not be a symlink.' >&2; exit 1; }
[ ! -e "$ROOT/probes" ] || [ -d "$ROOT/probes" ] || { echo 'Bootstrap probes path exists but is not a directory.' >&2; exit 1; }
[ ! -e "$PROTO" ] || { [ -f "$PROTO" ] && [ ! -L "$PROTO" ] && [ "$(sha "$PROTO")" = "$PROTO_SHA" ]; } || { echo 'A different bundled environment proto already exists; refusing.' >&2; exit 1; }
[ -d /private/etc/sudoers.d ] || { echo 'sudoers.d is unavailable; refusing to edit the main sudoers file.' >&2; exit 1; }

helper_cmd=/Users/portals-svc/portals/infra/mac-bootstrap/scripts/remote-ops-gate.sh
old_rule="andresb ALL=(portals-svc) NOPASSWD: $helper_cmd status, $helper_cmd preflight"
new_rule="andresb ALL=(portals-svc) NOPASSWD: $helper_cmd status, $helper_cmd preflight, $helper_cmd repair-lore-auth-discovery"
[ -f "$RULE" ] && [ ! -L "$RULE" ] || { echo 'Expected remote-ops sudoers rule is missing or unsafe.' >&2; exit 1; }
[ "$(/usr/bin/wc -l < "$RULE" | /usr/bin/tr -d ' ')" = 1 ] || { echo 'Remote-ops sudoers file has unexpected additional entries; refusing.' >&2; exit 1; }
if /usr/bin/grep -F -x -q "$new_rule" "$RULE"; then
  rule_state=new
elif /usr/bin/grep -F -x -q "$old_rule" "$RULE"; then
  rule_state=old
else
  echo 'Installed sudoers rule differs from the reviewed read-only rule; refusing.' >&2
  exit 1
fi

stamp=$(/bin/date -u '+%Y%m%dT%H%M%SZ')
for target in "$HELPER" "$CHECK"; do
  current_sha=$(sha "$target")
  wanted_sha=$NEW_HELPER_SHA
  [ "$target" != "$CHECK" ] || wanted_sha=$NEW_CHECK_SHA
  if [ "$current_sha" != "$wanted_sha" ]; then
    [ ! -e "$target.pre-lore-discovery-$stamp" ] || { echo 'Backup path already exists; refusing.' >&2; exit 1; }
  fi
done
if [ "$rule_state" = old ]; then
  [ ! -e "$RULE.pre-lore-discovery-$stamp" ] || { echo 'Sudoers backup path already exists; refusing.' >&2; exit 1; }
fi

if [ ! -d "$ROOT/probes" ]; then
  /bin/mkdir "$ROOT/probes"
  /usr/sbin/chown portals-svc:staff "$ROOT/probes"
  /bin/chmod 0755 "$ROOT/probes"
fi

tmp_rule=$(/usr/bin/mktemp /private/etc/sudoers.d/portals-remote-ops-gate.XXXXXX)
tmp_helper=$(/usr/bin/mktemp "$ROOT/scripts/remote-ops-gate.XXXXXX")
tmp_check=$(/usr/bin/mktemp "$ROOT/scripts/check-release.XXXXXX")
tmp_repair=$(/usr/bin/mktemp "$ROOT/scripts/repair-lore-auth-discovery.XXXXXX")
tmp_discovery_check=$(/usr/bin/mktemp "$ROOT/scripts/check-lore-discovery.XXXXXX")
tmp_proto=$(/usr/bin/mktemp "$ROOT/probes/environment-v1.XXXXXX")
trap '/bin/rm -f "${tmp_rule:-}" "${tmp_helper:-}" "${tmp_check:-}" "${tmp_repair:-}" "${tmp_discovery_check:-}" "${tmp_proto:-}"' EXIT HUP INT TERM

/bin/cp "$STAGED_HELPER" "$tmp_helper"
/bin/cp "$STAGED_REPAIR" "$tmp_repair"
/bin/cp "$STAGED_DISCOVERY_CHECK" "$tmp_discovery_check"
/bin/cp "$STAGED_CHECK" "$tmp_check"
/bin/cp "$STAGED_PROTO" "$tmp_proto"
/usr/sbin/chown portals-svc:staff "$tmp_helper" "$tmp_repair" "$tmp_discovery_check" "$tmp_check" "$tmp_proto"
/bin/chmod -N "$tmp_helper" "$tmp_repair" "$tmp_discovery_check" "$tmp_check" "$tmp_proto"
/bin/chmod 0500 "$tmp_helper" "$tmp_repair"
/bin/chmod 0644 "$tmp_discovery_check"
/bin/chmod 0644 "$tmp_check"
/bin/chmod 0644 "$tmp_proto"

if [ "$rule_state" = old ]; then
  /usr/bin/printf '%s\n' "$new_rule" > "$tmp_rule"
  /usr/sbin/chown root:wheel "$tmp_rule"
  /bin/chmod -N "$tmp_rule"
  /bin/chmod 0440 "$tmp_rule"
  /usr/sbin/visudo -cf "$tmp_rule" >/dev/null
fi

for target in "$HELPER" "$CHECK"; do
  current_sha=$(sha "$target")
  wanted_sha=$NEW_HELPER_SHA
  [ "$target" != "$CHECK" ] || wanted_sha=$NEW_CHECK_SHA
  if [ "$current_sha" != "$wanted_sha" ]; then
    backup="$target.pre-lore-discovery-$stamp"
    /bin/cp -p "$target" "$backup"
  fi
done

/bin/mv "$tmp_helper" "$HELPER"
/bin/mv "$tmp_check" "$CHECK"
/bin/mv "$tmp_repair" "$REPAIR"
/bin/mv "$tmp_discovery_check" "$DISCOVERY_CHECK"
/bin/mv "$tmp_proto" "$PROTO"
[ "$(sha "$HELPER")" = "$NEW_HELPER_SHA" ] || { echo 'Installed gate checksum mismatch.' >&2; exit 1; }
[ "$(sha "$CHECK")" = "$NEW_CHECK_SHA" ] || { echo 'Installed validator checksum mismatch.' >&2; exit 1; }
[ "$(sha "$REPAIR")" = "$NEW_REPAIR_SHA" ] || { echo 'Installed repair checksum mismatch.' >&2; exit 1; }
[ "$(sha "$DISCOVERY_CHECK")" = "$DISCOVERY_CHECK_SHA" ] || { echo 'Installed discovery checker checksum mismatch.' >&2; exit 1; }
[ "$(sha "$PROTO")" = "$PROTO_SHA" ] || { echo 'Installed environment proto checksum mismatch.' >&2; exit 1; }
if [ "$rule_state" = old ]; then
  /bin/cp -p "$RULE" "$RULE.pre-lore-discovery-$stamp"
  /bin/mv "$tmp_rule" "$RULE"
fi
trap - EXIT HUP INT TERM
/usr/sbin/visudo -c >/dev/null
echo 'LORE_DISCOVERY_GATE_INSTALLED: fixed repair action added; existing status/preflight retained; no shell or root command granted.'

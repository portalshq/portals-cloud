#!/bin/sh
set -eu

# One-time, administrator-authenticated installer. The new root-owned gate
# accepts only reviewed fixed actions and runs solely as portals-svc.
SOURCE=/Users/Shared/portals-remote-acceptance-gate-20261018.sh
EXPECTED_SHA=808898b370cb6259dc5b8c9fa8f0282d928d74d22544181cd1f3b8fa6fce01ff
GATE_DIR=/private/etc/portals-ops
GATE=$GATE_DIR/remote-acceptance-gate.sh
RULE=/private/etc/sudoers.d/portals-remote-acceptance-gate
RULE_TEXT="andresb ALL=(portals-svc) NOPASSWD: $GATE deploy-auth-plan, $GATE deploy-lore-plan, $GATE deploy-auth, $GATE deploy-lore, $GATE auth-fixture-test"

fail() { printf '%s\n' "$1" >&2; exit 1; }
sha() { /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}'; }

[ "$(/usr/bin/id -u)" -eq 0 ] || fail 'Run the installer through administrator sudo.'
[ "${SUDO_USER:-}" = andresb ] || fail 'Run the installer from the andresb administrator account.'
[ "$(/usr/bin/id -u portals-svc)" != 0 ] || fail 'Service account must not be root.'
if /usr/bin/id -Gn portals-svc | /usr/bin/grep -Eq '(^|[[:space:]])admin([[:space:]]|$)'; then
  fail 'Service account must not belong to the admin group.'
fi
[ -d /private/etc/sudoers.d ] && [ ! -L /private/etc/sudoers.d ] || fail 'sudoers.d is unavailable or unsafe.'
[ -f "$SOURCE" ] && [ ! -L "$SOURCE" ] || fail 'Reviewed staged gate is missing or unsafe.'
[ "$(sha "$SOURCE")" = "$EXPECTED_SHA" ] || fail 'Staged gate checksum mismatch.'
/bin/sh -n "$SOURCE" || fail 'Staged gate syntax is invalid.'

if [ ! -e "$GATE_DIR" ]; then
  /bin/mkdir "$GATE_DIR"
  /usr/sbin/chown root:wheel "$GATE_DIR"
  /bin/chmod 0755 "$GATE_DIR"
fi
[ -d "$GATE_DIR" ] && [ ! -L "$GATE_DIR" ] || fail 'Gate directory is unsafe.'
[ "$(/usr/bin/stat -f '%Su' "$GATE_DIR")" = root ] || fail 'Gate directory must be root-owned.'

if [ -e "$GATE" ]; then
  [ -f "$GATE" ] && [ ! -L "$GATE" ] || fail 'Existing gate is unsafe.'
  [ "$(sha "$GATE")" = "$EXPECTED_SHA" ] || fail 'Existing gate differs from the reviewed version.'
  [ "$(/usr/bin/stat -f '%Su' "$GATE")" = root ] || fail 'Existing gate must be root-owned.'
else
  tmp_gate=$(/usr/bin/mktemp "$GATE_DIR/remote-acceptance-gate.XXXXXX")
  trap '/bin/rm -f "${tmp_gate:-}" "${tmp_rule:-}"' EXIT HUP INT TERM
  /bin/cp "$SOURCE" "$tmp_gate"
  [ "$(sha "$tmp_gate")" = "$EXPECTED_SHA" ] || fail 'Copied gate checksum mismatch.'
  /usr/sbin/chown root:wheel "$tmp_gate"
  /bin/chmod -N "$tmp_gate"
  /bin/chmod 0555 "$tmp_gate"
  /bin/mv "$tmp_gate" "$GATE"
  tmp_gate=
fi

if [ -e "$RULE" ]; then
  [ -f "$RULE" ] && [ ! -L "$RULE" ] || fail 'Existing sudoers rule is unsafe.'
  [ "$(/usr/bin/wc -l < "$RULE" | /usr/bin/tr -d ' ')" = 1 ] || fail 'Existing sudoers rule has unexpected content.'
  /usr/bin/grep -F -x -q "$RULE_TEXT" "$RULE" || fail 'Existing sudoers rule differs from the reviewed fixed-action grant.'
  /usr/sbin/visudo -cf "$RULE" >/dev/null || fail 'Existing sudoers rule is invalid.'
else
  tmp_rule=$(/usr/bin/mktemp /private/etc/sudoers.d/portals-remote-acceptance-gate.XXXXXX)
  trap '/bin/rm -f "${tmp_gate:-}" "${tmp_rule:-}"' EXIT HUP INT TERM
  /usr/bin/printf '%s\n' "$RULE_TEXT" > "$tmp_rule"
  /usr/sbin/chown root:wheel "$tmp_rule"
  /bin/chmod -N "$tmp_rule"
  /bin/chmod 0440 "$tmp_rule"
  /usr/sbin/visudo -cf "$tmp_rule" >/dev/null || fail 'Candidate sudoers rule is invalid.'
  /bin/mv "$tmp_rule" "$RULE"
  tmp_rule=
fi
trap - EXIT HUP INT TERM
/usr/sbin/visudo -c >/dev/null || fail 'Installed sudoers configuration failed validation.'
/usr/bin/printf '%s\n' 'REMOTE_ACCEPTANCE_GATE_INSTALLED: five fixed actions as portals-svc; no arbitrary shell or root grant.'

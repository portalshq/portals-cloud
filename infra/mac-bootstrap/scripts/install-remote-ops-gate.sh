#!/bin/sh
set -eu

# Run once from an authenticated admin SSH session with sudo. The installer
# adds only exact sudo-as-portals-svc commands, never a general NOPASSWD grant.
SOURCE=/Users/Shared/portals-remote-ops-gate.sh
TARGET=/Users/portals-svc/portals/infra/mac-bootstrap/scripts/remote-ops-gate.sh
SSH_DIR=/Users/portals-svc/.ssh
AUTHORIZED_KEYS=$SSH_DIR/authorized_keys
EXPECTED_SHA256=1e488ece9986cf20c16e5a3fe9d79e764ff06afd0c48b777321c7611024acabf
PUBLIC_KEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDrJOtpjx+bHHUXSBskbRQ5RiscGXQjBaiG5xxufDyfF bryantmejia722@outlook.com'
AUTHORIZED_KEY="command=\"$TARGET\",restrict $PUBLIC_KEY"

[ "$(id -u)" -eq 0 ] || { echo 'Run this installer through sudo.' >&2; exit 1; }
[ -f "$SOURCE" ] && [ ! -L "$SOURCE" ] || { echo 'Staged gate helper is missing or not a regular file.' >&2; exit 1; }
[ "$(/usr/bin/shasum -a 256 "$SOURCE" | /usr/bin/awk '{print $1}')" = "$EXPECTED_SHA256" ] || { echo 'Staged gate helper checksum mismatch.' >&2; exit 1; }
[ -d /Users/portals-svc ] && [ ! -L /Users/portals-svc ] || { echo 'Service home is unavailable or a symlink.' >&2; exit 1; }
[ ! -e "$TARGET" ] || { echo 'Target helper already exists; refusing to overwrite it.' >&2; exit 1; }
[ ! -L "$SSH_DIR" ] || { echo 'Service SSH directory is a symlink; refusing.' >&2; exit 1; }

/usr/sbin/chown portals-svc:staff "$SOURCE"
/bin/chmod 0500 "$SOURCE"
/bin/cp -p "$SOURCE" "$TARGET"
/usr/sbin/chown portals-svc:staff "$TARGET"
/bin/chmod 0500 "$TARGET"

/bin/mkdir -p "$SSH_DIR"
/usr/sbin/chown portals-svc:staff "$SSH_DIR"
/bin/chmod -N "$SSH_DIR"
/bin/chmod 0700 "$SSH_DIR"
if [ -e "$AUTHORIZED_KEYS" ]; then
  [ -f "$AUTHORIZED_KEYS" ] && [ ! -L "$AUTHORIZED_KEYS" ] || { echo 'authorized_keys is not a regular file; refusing.' >&2; exit 1; }
  /usr/bin/grep -F -x -q "$AUTHORIZED_KEY" "$AUTHORIZED_KEYS" && { echo 'REMOTE_OPS_GATE_ALREADY_INSTALLED'; exit 0; }
  /usr/bin/grep -F -q 'AAAAC3NzaC1lZDI1NTE5AAAAIDrJOtpjx+bHHUXSBskbRQ5RiscGXQjBaiG5xxufDyfF' "$AUTHORIZED_KEYS" && { echo 'This public key is already authorized with different restrictions; refusing a potentially unrestricted duplicate.' >&2; exit 1; }
  tmp=$(/usr/bin/mktemp "$SSH_DIR/authorized_keys.XXXXXX")
  /bin/cp -p "$AUTHORIZED_KEYS" "$tmp"
else
  tmp=$(/usr/bin/mktemp "$SSH_DIR/authorized_keys.XXXXXX")
fi
trap '/bin/rm -f "$tmp"' EXIT HUP INT TERM
/usr/bin/printf '%s\n' "$AUTHORIZED_KEY" >> "$tmp"
/usr/sbin/chown portals-svc:staff "$tmp"
/bin/chmod -N "$tmp"
/bin/chmod 0600 "$tmp"
/bin/mv "$tmp" "$AUTHORIZED_KEYS"
trap - EXIT HUP INT TERM
echo 'REMOTE_OPS_GATE_INSTALLED: restricted key accepts only status/preflight; no sudoers change and no secret values are exposed.'

#!/bin/sh
# One-time root entrypoint for the reviewed public PostgreSQL relay release.
set -eu

ARCHIVE=/Users/Shared/portals-postgres-relay-release.tgz
INSTALLER=/Users/Shared/install-postgres-relay-release.sh
STAGED_ROOT=/Users/Shared/portals-postgres-relay-release
ARCHIVE_SHA=55559c5d6df7664545c676988e7470954cc4269a5847a35f7b747283af9f2f52
INSTALLER_SHA=a86a4129a640635e1e7680ea1f91d91b48efd40912f8f8c49496533a3fec2d93

test "$(id -u)" -eq 0 || { echo 'Run as root via sudo.' >&2; exit 1; }
test "$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')" = "$ARCHIVE_SHA" || { echo 'PostgreSQL release archive checksum mismatch.' >&2; exit 1; }
test "$(shasum -a 256 "$INSTALLER" | awk '{print $1}')" = "$INSTALLER_SHA" || { echo 'PostgreSQL installer checksum mismatch.' >&2; exit 1; }
test ! -e "$STAGED_ROOT" || { echo "Refusing to reuse existing staged directory: $STAGED_ROOT" >&2; exit 1; }
mkdir -m 0700 "$STAGED_ROOT"
tar -xzf "$ARCHIVE" -C "$STAGED_ROOT"
exec env STAGED_ROOT="$STAGED_ROOT" /bin/sh "$INSTALLER"

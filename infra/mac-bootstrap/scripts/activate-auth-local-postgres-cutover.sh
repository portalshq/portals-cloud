#!/bin/sh
# One-time root entrypoint for the reviewed Auth-to-local-PostgreSQL cutover.
set -eu

ARCHIVE=/Users/Shared/portals-auth-local-postgres.tgz
INSTALLER=/Users/Shared/install-auth-local-postgres-cutover.sh
STAGED_ROOT=/Users/Shared/portals-auth-local-postgres
ARCHIVE_SHA=a5e78e8698879afff0c3814567279dd056ed00e7d8afa42e9e8d77e2bacc4186
INSTALLER_SHA=bee6e2b98f4279b370dec7335c401ef8c7d981d63a62d60b8d5d9490e6263570

test "$(id -u)" -eq 0 || { echo 'Run as root via sudo.' >&2; exit 1; }
test "$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')" = "$ARCHIVE_SHA" || { echo 'Auth cutover archive checksum mismatch.' >&2; exit 1; }
test "$(shasum -a 256 "$INSTALLER" | awk '{print $1}')" = "$INSTALLER_SHA" || { echo 'Auth cutover installer checksum mismatch.' >&2; exit 1; }
test ! -e "$STAGED_ROOT" || { echo "Refusing to reuse existing staged directory: $STAGED_ROOT" >&2; exit 1; }
mkdir -m 0700 "$STAGED_ROOT"
tar -xzf "$ARCHIVE" -C "$STAGED_ROOT"
exec env STAGED_ROOT="$STAGED_ROOT" /bin/sh "$INSTALLER"

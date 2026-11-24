#!/bin/sh
# Installs the schema-owner repair, then resumes the Auth local-PostgreSQL cutover.
set -eu

SOURCE=/Users/Shared/cutover-auth-to-local-postgres.sh.schema-repair
TARGET=/Users/portals-svc/portals/infra/mac-bootstrap/scripts/cutover-auth-to-local-postgres.sh
EXPECTED_SHA=3532ee3bfaaf02731bbc475efbb501fc10e849d2dde87117f849bc07d842a7e0

test "$(id -u)" -eq 0 || { echo 'Run as root via sudo.' >&2; exit 1; }
test "$(shasum -a 256 "$SOURCE" | awk '{print $1}')" = "$EXPECTED_SHA" || { echo 'Auth schema repair checksum mismatch.' >&2; exit 1; }
backup="$TARGET.pre-schema-permission-repair-$(date -u +%Y%m%dT%H%M%SZ)"
cp -p "$TARGET" "$backup"
install -o portals-svc -g staff -m 0755 "$SOURCE" "$TARGET"
exec /bin/sh "$TARGET"

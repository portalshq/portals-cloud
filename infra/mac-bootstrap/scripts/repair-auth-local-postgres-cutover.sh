#!/bin/sh
# Repairs the initial bootstrap-role assumption, then resumes the Auth cutover.
set -eu

ROOT=/Users/portals-svc/portals/infra/mac-bootstrap
PROVISION_SOURCE=/Users/Shared/provision-postgres-mtls.sh.auth-repair
CUTOVER_SOURCE=/Users/Shared/cutover-auth-to-local-postgres.sh.auth-repair
PROVISION_SHA=b97e17a22e05e0bc313b67ea4897eeee62ee976d65c94bbadef590a668bf1870
CUTOVER_SHA=7e35d09cda816765c1fbf5a6476ec30d3cb86db443213b5291495c583a0e0d66

test "$(id -u)" -eq 0 || { echo 'Run as root via sudo.' >&2; exit 1; }
test "$(shasum -a 256 "$PROVISION_SOURCE" | awk '{print $1}')" = "$PROVISION_SHA" || { echo 'PostgreSQL provision repair checksum mismatch.' >&2; exit 1; }
test "$(shasum -a 256 "$CUTOVER_SOURCE" | awk '{print $1}')" = "$CUTOVER_SHA" || { echo 'Auth cutover repair checksum mismatch.' >&2; exit 1; }
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
for name in provision-postgres-mtls.sh cutover-auth-to-local-postgres.sh; do
  target="$ROOT/scripts/$name"
  cp -p "$target" "$target.pre-bootstrap-role-repair-$timestamp"
done
install -o portals-svc -g staff -m 0755 "$PROVISION_SOURCE" "$ROOT/scripts/provision-postgres-mtls.sh"
install -o portals-svc -g staff -m 0755 "$CUTOVER_SOURCE" "$ROOT/scripts/cutover-auth-to-local-postgres.sh"
exec /bin/sh "$ROOT/scripts/cutover-auth-to-local-postgres.sh"

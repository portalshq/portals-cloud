#!/bin/sh
# Installs the reviewed Auth-to-local-PostgreSQL cutover and runs it as Mac root.
set -eu

SERVICE_USER=portals-svc
SERVICE_GROUP=staff
ROOT=/Users/portals-svc/portals/infra/mac-bootstrap
RELEASE_ENV=/Users/portals-svc/portals-release.env
STAGED_ROOT=${STAGED_ROOT:-/Users/Shared/portals-auth-local-postgres}

test "$(id -u)" -eq 0 || { echo 'Run as root via sudo.' >&2; exit 1; }
test -d "$ROOT" && test -r "$RELEASE_ENV" && test -d "$STAGED_ROOT" || { echo 'Missing bootstrap checkout, release environment, or staged files.' >&2; exit 1; }
for file in templates/compose.prod.yaml scripts/bootstrap.sh scripts/check-release.mjs scripts/deploy.sh scripts/provision-postgres-mtls.sh scripts/cutover-auth-to-local-postgres.sh; do
  test -f "$STAGED_ROOT/$file" || { echo "Staged file is missing: $file" >&2; exit 1; }
done

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
for file in templates/compose.prod.yaml scripts/bootstrap.sh scripts/check-release.mjs scripts/deploy.sh scripts/provision-postgres-mtls.sh; do
  target="$ROOT/$file"
  cp -p "$target" "$target.pre-auth-local-postgres-$timestamp"
  install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0755 "$STAGED_ROOT/$file" "$target"
done
install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0755 "$STAGED_ROOT/scripts/cutover-auth-to-local-postgres.sh" "$ROOT/scripts/cutover-auth-to-local-postgres.sh"

if grep -q '^AUTH_DB_TLS_DIR=' "$RELEASE_ENV"; then
  test "$(sed -n 's/^AUTH_DB_TLS_DIR=//p' "$RELEASE_ENV")" = /Users/portals-svc/secrets/auth-db-tls || { echo 'AUTH_DB_TLS_DIR conflicts with this release.' >&2; exit 1; }
else
  printf '\nAUTH_DB_TLS_DIR=/Users/portals-svc/secrets/auth-db-tls\n' >>"$RELEASE_ENV"
fi
chown "$SERVICE_USER:$SERVICE_GROUP" "$RELEASE_ENV"
chmod 0600 "$RELEASE_ENV"

exec "$ROOT/scripts/cutover-auth-to-local-postgres.sh"

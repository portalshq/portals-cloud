#!/bin/sh
# Installs the reviewed PostgreSQL relay files, creates mTLS credentials, then starts the release.
set -eu

LC_ALL=C
LANG=C
export LC_ALL LANG

SERVICE_USER=portals-svc
SERVICE_GROUP=staff
ROOT=/Users/portals-svc/portals/infra/mac-bootstrap
RELEASE_ENV=/Users/portals-svc/portals-release.env
STAGED_ROOT=${STAGED_ROOT:-/Users/Shared/portals-postgres-relay-release}

test "$(id -u)" -eq 0 || { echo 'Run as root via sudo.' >&2; exit 1; }
test -d "$ROOT" || { echo "Missing bootstrap checkout: $ROOT" >&2; exit 1; }
test -r "$RELEASE_ENV" || { echo "Missing release environment: $RELEASE_ENV" >&2; exit 1; }
test -d "$STAGED_ROOT" || { echo "Missing staged release files: $STAGED_ROOT" >&2; exit 1; }

for file in templates/compose.prod.yaml scripts/bootstrap.sh scripts/check-release.mjs scripts/deploy.sh scripts/provision-postgres-mtls.sh; do
  test -f "$STAGED_ROOT/$file" || { echo "Staged file is missing: $file" >&2; exit 1; }
done

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
for file in templates/compose.prod.yaml scripts/bootstrap.sh scripts/check-release.mjs scripts/deploy.sh; do
  target="$ROOT/$file"
  backup="$target.pre-postgres-relay-$timestamp"
  cp -p "$target" "$backup"
  install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0755 "$STAGED_ROOT/$file" "$target"
done
install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0755 "$STAGED_ROOT/scripts/provision-postgres-mtls.sh" "$ROOT/scripts/provision-postgres-mtls.sh"

ensure_assignment() {
  key=$1
  value=$2
  if grep -q "^$key=" "$RELEASE_ENV"; then
    existing=$(sed -n "s/^$key=//p" "$RELEASE_ENV")
    test "$existing" = "$value" || { echo "$key conflicts with the reviewed PostgreSQL release value" >&2; exit 1; }
  else
    printf '\n%s=%s\n' "$key" "$value" >>"$RELEASE_ENV"
  fi
}

ensure_assignment POSTGRES_IMAGE_DIGEST postgres@sha256:e18480a22d6e48f4d816a6696769b1ec09ac73a824c5649e49c7d8b684913f3d
ensure_assignment POSTGRES_ENV_FILE /Users/portals-svc/secrets/postgres.env
ensure_assignment POSTGRES_SECRET_DIR /Users/portals-svc/secrets/postgres
ensure_assignment POSTGRES_TLS_DIR /Users/portals-svc/secrets/postgres-tls
chown "$SERVICE_USER:$SERVICE_GROUP" "$RELEASE_ENV"
chmod 0600 "$RELEASE_ENV"

POSTGRES_HOSTNAME=${POSTGRES_HOSTNAME:-db.portals.works} "$ROOT/scripts/provision-postgres-mtls.sh"
sudo -H -u "$SERVICE_USER" env MAC_RELEASE_ENV="$RELEASE_ENV" "$ROOT/scripts/deploy.sh"

echo "POSTGRES_RELAY_RELEASE=ready certificate_host=${POSTGRES_HOSTNAME:-db.portals.works}"

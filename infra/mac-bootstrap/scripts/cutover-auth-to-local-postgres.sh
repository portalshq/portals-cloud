#!/bin/sh
# Moves Auth Gateway to the local PostgreSQL instance with an isolated role/database.
set -eu

LC_ALL=C
LANG=C
export LC_ALL LANG

SERVICE_USER=portals-svc
SERVICE_GROUP=staff
ROOT=/Users/portals-svc/portals/infra/mac-bootstrap
RELEASE_ENV=/Users/portals-svc/portals-release.env
AUTH_ENV=/Users/portals-svc/secrets/auth.env
AUTH_DB_TLS_DIR=/Users/portals-svc/secrets/auth-db-tls
AUTH_DB_PASSWORD=/Users/portals-svc/secrets/auth-db-password
POSTGRES_ENV=/Users/portals-svc/secrets/postgres.env
POSTGRES_CONTAINER=templates-postgres-1
DOCKER_HOST=unix:///Users/andresb/.docker/run/docker.sock
export DOCKER_HOST

test "$(id -u)" -eq 0 || { echo 'Run as root via sudo.' >&2; exit 1; }
test -r "$RELEASE_ENV" && test -r "$AUTH_ENV" && test -r "$POSTGRES_ENV" || { echo 'Missing release, Auth, or PostgreSQL environment.' >&2; exit 1; }
"$ROOT/scripts/provision-postgres-mtls.sh"
test -r "$AUTH_DB_TLS_DIR/ca.crt" && test -r "$AUTH_DB_TLS_DIR/client.crt" && test -r "$AUTH_DB_TLS_DIR/client.key" || { echo 'Run provision-postgres-mtls.sh before Auth cutover.' >&2; exit 1; }
docker inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1 || { echo 'Local PostgreSQL container is not running.' >&2; exit 1; }
docker restart "$POSTGRES_CONTAINER" >/dev/null
attempts=30
while ! docker inspect --format '{{.State.Health.Status}}' "$POSTGRES_CONTAINER" | grep -qx healthy; do
  attempts=$((attempts - 1))
  test "$attempts" -gt 0 || { echo 'Local PostgreSQL did not become healthy after certificate reload.' >&2; exit 1; }
  sleep 2
done
postgres_admin=$(sed -n 's/^POSTGRES_USER=//p' "$POSTGRES_ENV")
case "$postgres_admin" in *[!a-zA-Z0-9_]*|'') echo 'POSTGRES_USER is invalid.' >&2; exit 1 ;; esac

umask 077
if [ ! -f "$AUTH_DB_PASSWORD" ]; then
  openssl rand -hex 32 >"$AUTH_DB_PASSWORD"
fi
password=$(cat "$AUTH_DB_PASSWORD")
case "$password" in *[!a-f0-9]*|'') echo 'Auth database password is invalid.' >&2; exit 1 ;; esac

role_exists=$(docker exec "$POSTGRES_CONTAINER" psql -U "$postgres_admin" -d postgres -Atqc "SELECT 1 FROM pg_roles WHERE rolname='auth_gateway'")
if [ "$role_exists" = 1 ]; then
  printf "ALTER ROLE auth_gateway LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '%s';\n" "$password" | docker exec -i "$POSTGRES_CONTAINER" psql -U "$postgres_admin" -d postgres -v ON_ERROR_STOP=1 >/dev/null
else
  printf "CREATE ROLE auth_gateway LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '%s';\n" "$password" | docker exec -i "$POSTGRES_CONTAINER" psql -U "$postgres_admin" -d postgres -v ON_ERROR_STOP=1 >/dev/null
fi

owner=$(docker exec "$POSTGRES_CONTAINER" psql -U "$postgres_admin" -d postgres -Atqc "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='auth_gateway'")
if [ -z "$owner" ]; then
  docker exec "$POSTGRES_CONTAINER" createdb -U "$postgres_admin" -O auth_gateway auth_gateway
elif [ "$owner" != auth_gateway ]; then
  echo 'Existing auth_gateway database has an unexpected owner; refusing cutover.' >&2
  exit 1
fi
docker exec "$POSTGRES_CONTAINER" psql -U "$postgres_admin" -d auth_gateway -v ON_ERROR_STOP=1 -c 'ALTER SCHEMA public OWNER TO auth_gateway; REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT USAGE, CREATE ON SCHEMA public TO auth_gateway;' >/dev/null
url="postgresql://auth_gateway:$password@db.portals.works:5432/auth_gateway?sslmode=verify-full&sslrootcert=/run/secrets/auth-db/ca.crt&sslcert=/run/secrets/auth-db/client.crt&sslkey=/run/secrets/auth-db/client.key"
backup="$AUTH_ENV.pre-local-postgres-$(date -u +%Y%m%dT%H%M%SZ)"
cp -p "$AUTH_ENV" "$backup"
tmp=$(mktemp "${AUTH_ENV}.XXXXXX")
awk -v url="$url" '
  /^DATABASE_URL=/ { print "DATABASE_URL=" url; changed=1; next }
  { print }
  END { if (!changed) exit 1 }
' "$AUTH_ENV" >"$tmp" || { rm -f "$tmp"; echo 'DATABASE_URL is missing from Auth environment.' >&2; exit 1; }
install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0600 "$tmp" "$AUTH_ENV"
rm -f "$tmp"
chown "$SERVICE_USER:$SERVICE_GROUP" "$AUTH_DB_PASSWORD"
chmod 0600 "$AUTH_DB_PASSWORD"

if ! sudo -H -u "$SERVICE_USER" env MAC_RELEASE_ENV="$RELEASE_ENV" "$ROOT/scripts/deploy.sh"; then
  cp -p "$backup" "$AUTH_ENV"
  chown "$SERVICE_USER:$SERVICE_GROUP" "$AUTH_ENV"
  chmod 0600 "$AUTH_ENV"
  sudo -H -u "$SERVICE_USER" env MAC_RELEASE_ENV="$RELEASE_ENV" "$ROOT/scripts/deploy.sh" || true
  echo "AUTH_LOCAL_POSTGRES_ROLLBACK=restored backup=$backup" >&2
  exit 1
fi

echo "AUTH_LOCAL_POSTGRES_CUTOVER=ready database=auth_gateway backup=$backup"

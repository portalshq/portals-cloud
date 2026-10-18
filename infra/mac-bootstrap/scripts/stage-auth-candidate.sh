#!/bin/sh
set -eu
umask 077

# Run as portals-svc on andresb. This exercises the promoted Auth image against
# an isolated, RAM-backed PostgreSQL instance; production data is never mounted.
[ "$(id -un)" = portals-svc ] || { echo 'Run as portals-svc' >&2; exit 1; }
PATH=/Users/Shared/portals-tools/bin:/Users/Shared/portals-tools/node_modules/.bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
export PATH

DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
RELEASE_ENV=${MAC_RELEASE_ENV:-/Users/portals-svc/portals-release.env}
test -r "$RELEASE_ENV" || { echo 'Release manifest is unreadable' >&2; exit 1; }
set -a
. "$RELEASE_ENV"
set +a

POSTGRES_STAGE_IMAGE=${AUTH_STAGE_POSTGRES_IMAGE:-postgres:16-alpine}
command -v docker >/dev/null 2>&1 || { echo 'Docker CLI is unavailable' >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo 'Node.js is unavailable' >&2; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo 'OpenSSL is unavailable' >&2; exit 1; }
GRPCURL=$(command -v grpcurl || true)
test -n "$GRPCURL" || { echo 'grpcurl is unavailable' >&2; exit 1; }
proto=${AUTH_TEST_PROTO_FILE:-$DIR/../lore/lore/lore-proto/proto/auth_api.proto}
if [ ! -r "$proto" ] && [ -r /Users/Shared/portals-auth-api-test-20261017.proto ]; then
  proto=/Users/Shared/portals-auth-api-test-20261017.proto
fi
test -r "$proto" || {
  echo "Auth API proto is missing; set AUTH_TEST_PROTO_FILE or restore the Lore checkout proto: $proto" >&2
  exit 1
}

# Bind the stage only to the promoted Auth digest from the checked-in BOM.
node --input-type=module -e '
import {readFileSync} from "node:fs";
const [file, image] = process.argv.slice(1);
const bom = readFileSync(file, "utf8");
const section = bom.match(/^control-plane:\n([\s\S]*?)(?=^[^ ])/m)?.[1];
const expected = section?.match(/^  image: "([^\"]+)"$/m)?.[1];
if (!expected || image !== expected || !/^portalshq\/auth-gateway@sha256:[a-f0-9]{64}$/.test(image)) {
  throw new Error("Auth stage image must exactly match the promoted immutable Docker Hub BOM pin");
}
' "$DIR/../lore/versions.yaml" "$AUTH_GATEWAY_IMAGE_DIGEST"

for port in 18084 18085 18086; do
  if /usr/sbin/lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Refusing Auth stage: loopback TCP port $port is already in use" >&2
    exit 1
  fi
done

mkdir -p "$HOME/.cache"
chmod 700 "$HOME/.cache"
suffix=$(openssl rand -hex 5)
stage_dir=$(mktemp -d "$HOME/.cache/portals-auth-stage-$suffix.XXXXXX")
chmod 700 "$stage_dir"
network="portals-auth-stage-$suffix"
postgres="portals-auth-stage-pg-$suffix"
auth="portals-auth-stage-auth-$suffix"
secret_seed="portals-auth-stage-secret-seed-$suffix"
secret_volume="portals-auth-stage-secrets-$suffix"

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  cleanup_ok=1
  for container in "$auth" "$postgres" "$secret_seed"; do
    if docker inspect "$container" >/dev/null 2>&1; then
      docker rm -f "$container" >/dev/null 2>&1 || cleanup_ok=0
      docker inspect "$container" >/dev/null 2>&1 && cleanup_ok=0
    fi
  done
  if docker network inspect "$network" >/dev/null 2>&1; then
    docker network rm "$network" >/dev/null 2>&1 || cleanup_ok=0
    docker network inspect "$network" >/dev/null 2>&1 && cleanup_ok=0
  fi
  if docker volume inspect "$secret_volume" >/dev/null 2>&1; then
    docker volume rm "$secret_volume" >/dev/null 2>&1 || cleanup_ok=0
    docker volume inspect "$secret_volume" >/dev/null 2>&1 && cleanup_ok=0
  fi
  case "$stage_dir" in
    "$HOME"/.cache/portals-auth-stage-*)
      /bin/rm -rf "$stage_dir" || cleanup_ok=0
      test ! -e "$stage_dir" || cleanup_ok=0
      ;;
    *) echo 'Refusing unexpected stage-directory cleanup target' >&2; cleanup_ok=0 ;;
  esac
  echo "AUTH_STAGE_CLEANUP=$([ "$cleanup_ok" -eq 1 ] && echo complete || echo INCOMPLETE)"
  [ "$cleanup_ok" -eq 1 ] || status=1
  exit "$status"
}
trap cleanup EXIT HUP INT TERM

docker pull "$POSTGRES_STAGE_IMAGE" >/dev/null
docker pull "$AUTH_GATEWAY_IMAGE_DIGEST" >/dev/null
postgres_id=$(docker image inspect "$POSTGRES_STAGE_IMAGE" --format '{{.Id}}')
auth_image_id=$(docker image inspect "$AUTH_GATEWAY_IMAGE_DIGEST" --format '{{.Id}}')
echo "STAGE_POSTGRES_IMAGE_ID=$postgres_id"
echo "STAGE_AUTH_IMAGE=$AUTH_GATEWAY_IMAGE_DIGEST"
echo "STAGE_AUTH_IMAGE_ID=$auth_image_id"

db_password=$(openssl rand -hex 24)
internal_token=$(openssl rand -hex 32)
jwt_kid="stage-$suffix"
issuer="https://auth-stage-$suffix.invalid"
mkdir -m 700 "$stage_dir/secrets"
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$stage_dir/secrets/signing-key" >/dev/null 2>&1
openssl rand -base64 32 > "$stage_dir/secrets/api-key-pepper"
chmod 400 "$stage_dir/secrets/signing-key" "$stage_dir/secrets/api-key-pepper"

cat > "$stage_dir/auth.env" <<EOF
DATABASE_URL=postgres://auth_stage:$db_password@postgres:5432/auth_stage
GRPC_LISTEN_ADDR=0.0.0.0:8084
HTTP_LISTEN_ADDR=0.0.0.0:8085
INTERNAL_LISTEN_ADDR=0.0.0.0:8086
REBAC_LISTEN_ADDR=0.0.0.0:8087
PUBLIC_BASE_URL=$issuer
OIDC_ISSUER=https://idp-stage.invalid
OIDC_CLIENT_ID=isolated-auth-stage
OIDC_REDIRECT_URI=$issuer/callback
JWT_ISSUER=$issuer
JWT_KID=$jwt_kid
JWT_SIGNING_ENABLED=true
JWT_SIGNING_PROVIDER=sealed-file
JWT_LOCAL_PRIVATE_KEY_PATH=/run/secrets/auth/signing-key
API_KEY_PEPPER_PROVIDER=sealed-file
API_KEY_PEPPER_FILE_PATH=/run/secrets/auth/api-key-pepper
INTERNAL_ADMIN_TOKEN=$internal_token
LORE_ENV=prod
AUTH_ACCESS_TOKEN_TTL_SECONDS=60
AWS_EC2_METADATA_DISABLED=true
RUST_LOG=warn
EOF
chmod 600 "$stage_dir/auth.env"

# Docker Desktop runs under the admin account, which may not have traversal
# permission on portals-svc's private cache. Transfer the two ephemeral files
# with `docker cp` into a named volume instead of bind-mounting that directory.
# The temporary helper uses the already-pulled Postgres image, has no network,
# and fixes ownership for the Auth image's nonroot UID before it is removed.
docker volume create "$secret_volume" >/dev/null
docker create --name "$secret_seed" --network none --user 0:0 \
  --mount "type=volume,source=$secret_volume,target=/stage-secrets" \
  --entrypoint /bin/sh "$POSTGRES_STAGE_IMAGE" -c 'sleep 300' >/dev/null
docker cp "$stage_dir/secrets/signing-key" "$secret_seed:/stage-secrets/signing-key" >/dev/null
docker cp "$stage_dir/secrets/api-key-pepper" "$secret_seed:/stage-secrets/api-key-pepper" >/dev/null
docker start "$secret_seed" >/dev/null
docker exec "$secret_seed" /bin/sh -ec \
  'chown 65532:65532 /stage-secrets/signing-key /stage-secrets/api-key-pepper && chmod 0400 /stage-secrets/signing-key /stage-secrets/api-key-pepper && test -r /stage-secrets/signing-key && test -r /stage-secrets/api-key-pepper'
docker rm -f "$secret_seed" >/dev/null

# Do not mark this network `--internal`: Docker's internal-network isolation
# prevents the host-side loopback-published ports from being reachable on
# Docker Desktop. The only published ports below bind to 127.0.0.1; Postgres
# remains un-published, credentials/data are disposable, and no production
# configuration is mounted.
docker network create "$network" >/dev/null
docker run -d --name "$postgres" --network "$network" --network-alias postgres \
  --tmpfs /var/lib/postgresql/data:rw,nosuid,size=512m \
  -e POSTGRES_USER=auth_stage -e POSTGRES_PASSWORD="$db_password" -e POSTGRES_DB=auth_stage \
  "$POSTGRES_STAGE_IMAGE" >/dev/null

ready=0
for _ in $(/usr/bin/seq 1 45); do
  if docker exec "$postgres" pg_isready -U auth_stage -d auth_stage >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ "$ready" = 1 ] || { echo 'STAGE_POSTGRES_NOT_READY' >&2; exit 1; }

docker run -d --name "$auth" --network "$network" \
  --publish 127.0.0.1:18084:8084 --publish 127.0.0.1:18085:8085 --publish 127.0.0.1:18086:8086 \
  --mount "type=volume,source=$secret_volume,target=/run/secrets/auth,readonly" \
  --env-file "$stage_dir/auth.env" --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --security-opt no-new-privileges --cap-drop ALL \
  "$AUTH_GATEWAY_IMAGE_DIGEST" >/dev/null
running_auth_image_id=$(docker inspect --format '{{.Image}}' "$auth")
[ "$running_auth_image_id" = "$auth_image_id" ] || {
  echo 'Staged Auth container image ID does not match the pulled promoted digest' >&2
  exit 1
}
echo "STAGE_AUTH_CONTAINER_IMAGE_ID=$running_auth_image_id"

ready=0
last_http_status=000
for _ in $(/usr/bin/seq 1 45); do
  last_http_status=$(/usr/bin/curl --connect-timeout 2 --max-time 3 --silent \
    --output /dev/null --write-out '%{http_code}' \
    http://127.0.0.1:18085/healthz 2>/dev/null || true)
  case "$last_http_status" in 2??) ready=1; break;; esac
  sleep 1
done
if [ "$ready" != 1 ]; then
  echo 'STAGE_AUTH_NOT_READY; sanitized startup diagnostics follow' >&2
  echo "STAGE_AUTH_HTTP_STATUS=$last_http_status"
  docker inspect --format 'STAGE_AUTH_STATE={{.State.Status}} EXIT={{.State.ExitCode}} ERROR={{.State.Error}} HEALTH={{if .State.Health}}{{.State.Health.Status}}{{else}}not-configured{{end}} RESTARTS={{.RestartCount}}' "$auth" 2>/dev/null || true
  docker inspect --format 'STAGE_AUTH_PORT_BINDINGS={{json .HostConfig.PortBindings}} EFFECTIVE_PORTS={{json .NetworkSettings.Ports}}' "$auth" 2>/dev/null || true
  docker port "$auth" 2>/dev/null || true
  for port in 18084 18085 18086; do
    /usr/sbin/lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | /usr/bin/sed "s/^/STAGE_HOST_LISTENER_${port}=/" || true
  done
  docker exec "$postgres" pg_isready -U auth_stage -d auth_stage 2>&1 || true
  docker exec "$postgres" psql -U auth_stage -d auth_stage -Atqc \
    'SELECT count(*) FROM information_schema.tables WHERE table_schema = '\''public'\'';' 2>&1 \
    | sed 's/^/STAGE_POSTGRES_PUBLIC_TABLES=/' || true
  docker exec "$auth" /usr/local/bin/lore-auth-gateway healthcheck 2>&1 \
    | /usr/bin/sed -e "s/$db_password/[REDACTED]/g" -e "s/$internal_token/[REDACTED]/g" \
    | /usr/bin/tail -n 5 >&2 || true
  docker logs "$auth" 2>&1 \
    | /usr/bin/sed -e "s/$db_password/[REDACTED]/g" -e "s/$internal_token/[REDACTED]/g" \
    | /usr/bin/tail -n 40 >&2 || true
  exit 1
fi

AUTH_TEST_ENV_FILE="$stage_dir/auth.env" \
AUTH_EXPECTED_ACCESS_TOKEN_TTL_SECONDS=60 \
AUTH_TEST_EXPECTED_ISSUER="$issuer" \
AUTH_TEST_INTERNAL_BASE_URL=http://127.0.0.1:18086 \
AUTH_TEST_HTTP_BASE_URL=http://127.0.0.1:18085 \
AUTH_TEST_GRPC_TARGET=127.0.0.1:18084 \
AUTH_TEST_GRPCURL_BIN="$GRPCURL" \
AUTH_TEST_PROTO_FILE="$proto" \
AUTH_TEST_IMPORT_PATH="$(dirname "$proto")" \
node "$DIR/scripts/test-auth-key-lifecycle.mjs" --create-isolated-fixture

echo 'AUTH_CANDIDATE_STAGE=PASS ttl_seconds=60 api_key_issue_rotate_overlap_revoke=PASS postgres_migrations=PASS'

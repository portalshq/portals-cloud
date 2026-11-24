#!/bin/sh
set -eu

PATH="$PATH:/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:/Users/Shared/portals-tools/node_modules/.bin:/Users/Shared/portals-tools/bin"
export PATH

test "$(uname -m)" = x86_64 || { echo 'An Intel Mac is required' >&2; exit 1; }
command -v docker >/dev/null || { echo 'Docker is required' >&2; exit 1; }
command -v pinggy >/dev/null || { echo 'Pinggy client is required' >&2; exit 1; }
command -v curl >/dev/null || { echo 'curl is required' >&2; exit 1; }
command -v nc >/dev/null || { echo 'nc is required' >&2; exit 1; }
command -v fdesetup >/dev/null || { echo 'FileVault tooling is required' >&2; exit 1; }
fdesetup status | grep -q 'FileVault is On' || { echo 'FileVault must be enabled' >&2; exit 1; }
command -v /usr/libexec/ApplicationFirewall/socketfilterfw >/dev/null || { echo 'macOS firewall tooling is required' >&2; exit 1; }
/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate | grep -q 'enabled' || { echo 'macOS firewall must be enabled' >&2; exit 1; }
test "$(id -un)" = portals-svc || { echo 'Run bootstrap as portals-svc' >&2; exit 1; }
test "$(df -Pk . | awk 'NR==2 {print $4}')" -ge 104857600 || { echo 'At least 100 GiB must be free on the runtime volume' >&2; exit 1; }
release_env=${MAC_RELEASE_ENV:?MAC_RELEASE_ENV is required}
test -r "$release_env" || { echo 'MAC_RELEASE_ENV is unreadable' >&2; exit 1; }
test "$(stat -f '%Su' "$release_env")" = "$(id -un)" || { echo 'MAC_RELEASE_ENV is not service-account owned' >&2; exit 1; }
case "$(stat -f '%Lp' "$release_env")" in *[1-7][0-7]|*[0-7][1-7]) echo 'MAC_RELEASE_ENV is group/world accessible' >&2; exit 1 ;; esac
set -a
. "$release_env"
set +a
mkdir -p "$HOME/Library/Logs"
chmod 700 "$HOME/Library/Logs"
test -r "${AUTH_ENV_FILE:?AUTH_ENV_FILE is required}" || exit 1
test -r "${LORE_ENV_FILE:?LORE_ENV_FILE is required}" || exit 1
test -r "${LORE_AWS_ENV_FILE:?LORE_AWS_ENV_FILE is required}" || exit 1
test -r "${CADDY_ENV_FILE:?CADDY_ENV_FILE is required}" || exit 1
test -r "${POSTGRES_ENV_FILE:?POSTGRES_ENV_FILE is required}" || exit 1
for secret_file in "$AUTH_ENV_FILE" "$LORE_ENV_FILE" "$LORE_AWS_ENV_FILE" "$CADDY_ENV_FILE" "$POSTGRES_ENV_FILE"; do
  test "$(stat -f '%Su' "$secret_file")" = "$(id -un)" || { echo "Secret file is not service-account owned: $secret_file" >&2; exit 1; }
  mode=$(stat -f '%Lp' "$secret_file")
  case "$mode" in
    *[1-7][0-7]|*[0-7][1-7]) echo "Secret file is group/world accessible: $secret_file" >&2; exit 1 ;;
  esac
done
test -d "${AUTH_SECRET_DIR:?AUTH_SECRET_DIR is required}" || { echo 'AUTH_SECRET_DIR is required' >&2; exit 1; }
test "$(stat -f '%Su' "$AUTH_SECRET_DIR")" = "$(id -un)" || { echo 'AUTH_SECRET_DIR is not service-account owned' >&2; exit 1; }
case "$(stat -f '%Lp' "$AUTH_SECRET_DIR")" in *[1-7][0-7]|*[0-7][1-7]) echo 'AUTH_SECRET_DIR is group/world accessible' >&2; exit 1 ;; esac
test -d "${AUTH_DB_TLS_DIR:?AUTH_DB_TLS_DIR is required}" || { echo 'AUTH_DB_TLS_DIR is required' >&2; exit 1; }
test "$(stat -f '%Su' "$AUTH_DB_TLS_DIR")" = "$(id -un)" || { echo 'AUTH_DB_TLS_DIR is not service-account owned' >&2; exit 1; }
case "$(stat -f '%Lp' "$AUTH_DB_TLS_DIR")" in *[1-7][0-7]|*[0-7][1-7]) echo 'AUTH_DB_TLS_DIR is group/world accessible' >&2; exit 1 ;; esac
DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$DIR"
node scripts/check-release.mjs
scripts/check-images.sh
# Docker Desktop bind-mount UID translation is runtime-dependent. Prove the
# distroless UID can read sealed files; never fix it with world-readable keys.
docker run --rm --network none --read-only --user 65532:65532 \
  --entrypoint /bin/sh \
  --mount "type=bind,source=$AUTH_SECRET_DIR,target=/run/secrets/auth,readonly" \
  --mount "type=bind,source=$AUTH_DB_TLS_DIR,target=/run/secrets/auth-db,readonly" \
  --mount "type=bind,source=$LORE_QUIC_CERT_DIR,target=/run/secrets/lore-quic,readonly" \
  "$CADDY_IMAGE_DIGEST" -ec 'test -r /run/secrets/auth/signing-key && test -r /run/secrets/auth/api-key-pepper && test -r /run/secrets/auth-db/ca.crt && test -r /run/secrets/auth-db/client.crt && test -r /run/secrets/auth-db/client.key && test -r /run/secrets/lore-quic/fullchain.pem && test -r /run/secrets/lore-quic/privkey.pem' \
  || { echo 'Container UID 65532 cannot read sealed files; fix runtime UID mapping, not world permissions' >&2; exit 1; }
# The official Postgres container uses UID 999. Prove it can read the server
# key before startup, otherwise PostgreSQL correctly refuses TLS initialization.
docker run --rm --network none --read-only --user 999:999 \
  --entrypoint /bin/sh \
  --mount "type=bind,source=$POSTGRES_SECRET_DIR,target=/run/secrets/postgres,readonly" \
  --mount "type=bind,source=$POSTGRES_TLS_DIR,target=/run/secrets/postgres-tls,readonly" \
  "$POSTGRES_IMAGE_DIGEST" -ec 'test -r /run/secrets/postgres/password && test -r /run/secrets/postgres-tls/ca.crt && test -r /run/secrets/postgres-tls/server.crt && test -r /run/secrets/postgres-tls/server.key && test -r /run/secrets/postgres-tls/pg_hba.conf' \
  || { echo 'PostgreSQL container UID 999 cannot read TLS material; fix Docker Desktop mount ACLs, not file modes' >&2; exit 1; }

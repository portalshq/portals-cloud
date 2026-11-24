#!/bin/sh
# Apply the audited WireGuard-only listener bindings, then recreate services.
set -eu

# macOS does not provide C.UTF-8; use the portable POSIX locale for deployment tools.
LC_ALL=C
LANG=C
export LC_ALL LANG

ROOT=${MAC_BOOTSTRAP_ROOT:-/Users/portals-svc/portals/infra/mac-bootstrap}
ENV_FILE=${MAC_RELEASE_ENV:-/Users/portals-svc/portals-release.env}
STAGED_DIR=${WIREGUARD_RELAY_STAGED_DIR:-/Users/Shared}
SERVICE_USER=portals-svc
SERVICE_GROUP=staff

test "$(id -u)" -eq 0 || { echo 'Run this script as root via sudo.' >&2; exit 1; }
test -f "$ENV_FILE" || { echo 'Release file is missing.' >&2; exit 1; }

install_file() {
  source=$1 target=$2 expected=$3
  actual=$(shasum -a 256 "$source" | awk '{print $1}')
  test "$actual" = "$expected" || { echo "Unexpected staged checksum: $source" >&2; exit 1; }
  backup="${target}.pre-wireguard-relay-$(date -u +%Y%m%dT%H%M%SZ)"
  cp -p "$target" "$backup"
  install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0644 "$source" "$target"
}

install_file "$STAGED_DIR/compose.prod.yaml" "$ROOT/templates/compose.prod.yaml" \
  fb6991858587c94f64a5812436bb02eb01dcfb567bf8a210f70e9c37fdc1aa78
install_file "$STAGED_DIR/check-release.mjs" "$ROOT/scripts/check-release.mjs" \
  276530283875735974c393826fc22bd12b830db0e0dc204fc6bcfa26e47d4989
install_file "$STAGED_DIR/deploy.sh" "$ROOT/scripts/deploy.sh" \
  b0ec678b733cec478ca4bd0b5a3ac13e21bd869e35e55a7b8e4f89e18e50b443

if grep -q '^RELAY_WIREGUARD_IP=' "$ENV_FILE"; then
  grep -qx 'RELAY_WIREGUARD_IP=10.77.0.2' "$ENV_FILE" || {
    echo 'Existing RELAY_WIREGUARD_IP is not the configured tunnel address.' >&2
    exit 1
  }
else
  printf '\n# AWS relay-only ingress; never replace with a LAN or wildcard address.\nRELAY_WIREGUARD_IP=10.77.0.2\n' >>"$ENV_FILE"
fi

lore_aws_env=$(awk -F= '/^LORE_AWS_ENV_FILE=/{print substr($0, index($0, "=") + 1)}' "$ENV_FILE")
test "$(printf '%s\n' "$lore_aws_env" | sed '/^$/d' | wc -l | tr -d ' ')" = 1 || {
  echo 'Release file must define exactly one LORE_AWS_ENV_FILE.' >&2
  exit 1
}
case "$lore_aws_env" in
  /*) ;;
  *) echo 'LORE_AWS_ENV_FILE must be an absolute path.' >&2; exit 1 ;;
esac
if grep -q '^AWS_REGION=' "$lore_aws_env"; then
  temp_lore_aws_env=$(mktemp "${lore_aws_env}.XXXXXX")
  trap 'rm -f "$temp_lore_aws_env"' EXIT HUP INT TERM
  grep -v '^AWS_REGION=' "$lore_aws_env" >"$temp_lore_aws_env"
  install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0600 "$temp_lore_aws_env" "$lore_aws_env"
  echo 'Removed duplicate AWS_REGION from the credentials-only Lore file.'
fi

chown "$SERVICE_USER:$SERVICE_GROUP" "$ENV_FILE"
chmod 0600 "$ENV_FILE"
sudo -H -u "$SERVICE_USER" /usr/bin/env MAC_RELEASE_ENV="$ENV_FILE" /bin/sh "$ROOT/scripts/deploy.sh"
echo 'WIREGUARD_RELAY_BINDINGS_APPLIED'

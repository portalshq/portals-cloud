#!/bin/sh
set -eu

test "$(uname -m)" = x86_64 || { echo 'An Intel Mac is required' >&2; exit 1; }
command -v docker >/dev/null || { echo 'Docker is required' >&2; exit 1; }
command -v caddy >/dev/null || { echo 'Caddy is required' >&2; exit 1; }
command -v pinggy >/dev/null || { echo 'Pinggy client is required' >&2; exit 1; }
command -v curl >/dev/null || { echo 'curl is required' >&2; exit 1; }
command -v nc >/dev/null || { echo 'nc is required' >&2; exit 1; }
command -v fdesetup >/dev/null || { echo 'FileVault tooling is required' >&2; exit 1; }
fdesetup status | grep -q 'FileVault is On' || { echo 'FileVault must be enabled' >&2; exit 1; }
command -v /usr/libexec/ApplicationFirewall/socketfilterfw >/dev/null || { echo 'macOS firewall tooling is required' >&2; exit 1; }
/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate | grep -q 'enabled' || { echo 'macOS firewall must be enabled' >&2; exit 1; }
test "$(id -un)" = portals-svc || { echo 'Run bootstrap as portals-svc' >&2; exit 1; }
test "$(df -Pk . | awk 'NR==2 {print $4}')" -ge 104857600 || { echo 'At least 100 GiB must be free on the runtime volume' >&2; exit 1; }
mkdir -p "$HOME/Library/Logs"
chmod 700 "$HOME/Library/Logs"
test -r "${AUTH_ENV_FILE:?AUTH_ENV_FILE is required}" || exit 1
test -r "${LORE_ENV_FILE:?LORE_ENV_FILE is required}" || exit 1
test -r "${WORKER_ENV_FILE:?WORKER_ENV_FILE is required}" || exit 1
test -r "${CADDY_ENV_FILE:?CADDY_ENV_FILE is required}" || exit 1
for secret_file in "$AUTH_ENV_FILE" "$LORE_ENV_FILE" "$WORKER_ENV_FILE" "$CADDY_ENV_FILE"; do
  test "$(stat -f '%Su' "$secret_file")" = "$(id -un)" || { echo "Secret file is not service-account owned: $secret_file" >&2; exit 1; }
  mode=$(stat -f '%Lp' "$secret_file")
  case "$mode" in
    *[1-7][0-7]|*[0-7][1-7]) echo "Secret file is group/world accessible: $secret_file" >&2; exit 1 ;;
  esac
done
DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$DIR"
node scripts/check-release.mjs
exec scripts/check-images.sh

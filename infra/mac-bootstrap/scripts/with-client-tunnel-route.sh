#!/usr/bin/env bash
set -euo pipefail

# Run one customer-like acceptance command through temporary Pinggy TCP/UDP
# routes. The privileged helper owns its resolver cleanup, even if sudo's
# timestamp expires during a long token-renewal test.
[[ $# -gt 0 && "$1" == -- ]] || { echo 'Usage: with-client-tunnel-route.sh -- COMMAND [ARGS...]' >&2; exit 2; }
shift
[[ $# -gt 0 ]] || { echo 'A test command is required' >&2; exit 2; }
for name in PINGGY_TCP_HOST PINGGY_TCP_PORT PINGGY_UDP_HOST PINGGY_UDP_PORT LORE_QUIC_PORT; do
  [[ -n "${!name:-}" ]] || { echo "Missing $name" >&2; exit 2; }
done
[[ "$(uname -s)" == Darwin ]] || { echo 'Client routing currently requires macOS' >&2; exit 2; }
source_helper="$(cd "$(dirname "$0")" && pwd)/client-tunnel-route.py"
installed_helper=/Library/PrivilegedHelperTools/com.portals.client-tunnel-route.py
[[ -f "$installed_helper" && ! -L "$installed_helper" && "$(stat -f '%Su:%Sg:%Lp' "$installed_helper")" == root:wheel:755 ]] || {
  echo 'Install the root-owned client route helper as documented before this test' >&2
  exit 2
}
cmp -s "$source_helper" "$installed_helper" || {
  echo 'Installed client route helper differs from this checkout; review and reinstall it' >&2
  exit 2
}
[[ -x /usr/bin/python3 && "$(stat -f '%Su' /usr/bin/python3)" == root ]] || {
  echo 'The trusted system Python interpreter is unavailable' >&2
  exit 2
}
[[ "$(/usr/bin/python3 --version 2>&1)" == Python\ 3.* ]] || {
  echo 'The system Python interpreter cannot start' >&2
  exit 2
}
route_dir="$(mktemp -d "${TMPDIR:-/tmp}/portals-client-route.XXXXXX")"
chmod 700 "$route_dir"
route_log="$route_dir/helper.log"
route_pid=''
cleanup() {
  local rc=$?
  trap - EXIT INT TERM HUP
  if [[ -n "$route_pid" ]]; then
    kill "$route_pid" 2>/dev/null || true
    for _ in {1..30}; do
      if grep -Fq CLIENT_ROUTE_CLEANED "$route_log" 2>/dev/null; then break; fi
      if ! kill -0 "$route_pid" 2>/dev/null; then break; fi
      sleep 0.1
    done
    if ! grep -Fq CLIENT_ROUTE_CLEANED "$route_log" 2>/dev/null; then
      echo 'ROUTE_CLEANUP_UNCONFIRMED: inspect /etc/hosts for # portals-network-client-route:' >&2
      rc=1
    fi
    wait "$route_pid" 2>/dev/null || true
  fi
  rm -rf "$route_dir"
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

sudo -n /usr/bin/python3 -I "$installed_helper" \
  "$PINGGY_TCP_HOST" "$PINGGY_TCP_PORT" \
  "$PINGGY_UDP_HOST" "$PINGGY_UDP_PORT" \
  "$LORE_QUIC_PORT" 443 "$$" >"$route_log" 2>&1 &
route_pid=$!
ready=0
for _ in {1..100}; do
  if grep -Fq CLIENT_ROUTE_READY "$route_log"; then ready=1; break; fi
  if ! kill -0 "$route_pid" 2>/dev/null; then break; fi
  sleep 0.1
done
if [[ "$ready" != 1 ]]; then
  sed -n '/CLIENT_ROUTE_/p' "$route_log" >&2
  echo 'Temporary client route did not start' >&2
  exit 1
fi
echo 'Temporary Auth/Lore TCP and Lore QUIC client routes are ready'
"$@"

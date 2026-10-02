#!/bin/sh
set -eu

release_env=${MAC_RELEASE_ENV:-/Users/portals-svc/portals-release.env}
test -r "$release_env" || { echo 'MAC_RELEASE_ENV is unreadable' >&2; exit 1; }
set -a
. "$release_env"
set +a
test -n "${PINGGY_TCP_COMMAND:?PINGGY_TCP_COMMAND is required}"
test -n "${PINGGY_UDP_COMMAND:?PINGGY_UDP_COMMAND is required}"
command -v nc >/dev/null || { echo 'nc is required' >&2; exit 1; }
while ! nc -z 127.0.0.1 8443 >/dev/null 2>&1; do sleep 2; done
sh -c "$PINGGY_TCP_COMMAND" &
tcp_pid=$!
sh -c "$PINGGY_UDP_COMMAND" &
udp_pid=$!
trap 'kill "$tcp_pid" "$udp_pid" 2>/dev/null || true' INT TERM EXIT
wait "$tcp_pid" "$udp_pid"

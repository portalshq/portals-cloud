#!/bin/sh
set -eu
PATH="$PATH:/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:/Users/Shared/portals-tools/node_modules/.bin:/Users/Shared/portals-tools/bin"
export PATH

release_env=${MAC_RELEASE_ENV:-/Users/portals-svc/portals-release.env}
test -r "$release_env" || { echo 'MAC_RELEASE_ENV is unreadable' >&2; exit 1; }
set -a
. "$release_env"
set +a
test -n "${PINGGY_TCP_COMMAND:?PINGGY_TCP_COMMAND is required}"
test -n "${PINGGY_UDP_COMMAND:?PINGGY_UDP_COMMAND is required}"
case "$PINGGY_TCP_COMMAND $PINGGY_UDP_COMMAND" in
  *__REPLACE_*|*'<'*'>'*) echo 'Pinggy commands still contain placeholders' >&2; exit 1 ;;
esac
command -v nc >/dev/null || { echo 'nc is required' >&2; exit 1; }
while ! nc -z 127.0.0.1 8443 >/dev/null 2>&1; do sleep 2; done
while ! curl --connect-timeout 3 --max-time 5 --fail --silent http://127.0.0.1:41339/health_check >/dev/null 2>&1; do sleep 2; done
# Commands must be single foreground invocations, not shell pipelines.
sh -c "exec $PINGGY_TCP_COMMAND" &
tcp_pid=$!
sh -c "exec $PINGGY_UDP_COMMAND" &
udp_pid=$!
trap 'kill "$tcp_pid" "$udp_pid" 2>/dev/null || true' INT TERM EXIT
while kill -0 "$tcp_pid" 2>/dev/null && kill -0 "$udp_pid" 2>/dev/null; do sleep 2; done
echo 'A Pinggy mapping exited; restarting both mappings through launchd' >&2
exit 1

#!/bin/sh
set -eu

PATH="$PATH:/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:/Users/Shared/portals-tools/node_modules/.bin:/Users/Shared/portals-tools/bin"
export PATH

if [ "$#" -gt 1 ]; then
  echo 'Usage: run-pinggy.sh [tcp|udp] (omit mode to start both)' >&2
  exit 2
fi
mode=${1:-both}
case "$mode" in
  both|tcp|udp) ;;
  *)
    echo 'Usage: run-pinggy.sh [tcp|udp] (omit mode to start both)' >&2
    exit 2
    ;;
esac

release_env=${MAC_RELEASE_ENV:-/Users/portals-svc/portals-release.env}
test -r "$release_env" || { echo 'MAC_RELEASE_ENV is unreadable' >&2; exit 1; }
set -a
. "$release_env"
set +a

known_hosts=${PINGGY_KNOWN_HOSTS_FILE:-/Users/portals-svc/.ssh/known_hosts}

validate_tcp_command() {
  test -n "${PINGGY_TCP_COMMAND:?PINGGY_TCP_COMMAND is required for tcp mode}"
  test -r "$known_hosts" || { echo "Pinggy known-hosts file is missing or unreadable: $known_hosts" >&2; exit 1; }
  case "$PINGGY_TCP_COMMAND" in
    *__REPLACE_*|*'<'*'>'*) echo 'Pinggy TCP command still contains placeholders' >&2; exit 1 ;;
  esac
  case "$PINGGY_TCP_COMMAND" in
    '/usr/bin/ssh '*|'ssh '*) ;;
    *) echo 'Pinggy TCP/TLS mappings must use native OpenSSH; the Node CLI does not enforce SSH host-key options' >&2; exit 1 ;;
  esac
  case "$PINGGY_TCP_COMMAND" in
    *StrictHostKeyChecking=no*|*StrictHostKeyChecking=off*|*UserKnownHostsFile=/dev/null*)
      echo 'Pinggy command disables SSH host-key verification' >&2
      exit 1
      ;;
  esac
  case "$PINGGY_TCP_COMMAND" in
    *StrictHostKeyChecking=yes*) ;;
    *) echo 'Pinggy TCP command must require StrictHostKeyChecking=yes' >&2; exit 1 ;;
  esac
  case "$PINGGY_TCP_COMMAND" in
    *"UserKnownHostsFile=$known_hosts"*) ;;
    *) echo "Pinggy TCP command must use the pinned known-hosts file: $known_hosts" >&2; exit 1 ;;
  esac
}

validate_udp_command() {
  test -n "${PINGGY_UDP_COMMAND:?PINGGY_UDP_COMMAND is required for udp mode}"
  case "$PINGGY_UDP_COMMAND" in
    *__REPLACE_*|*'<'*'>'*) echo 'Pinggy UDP command still contains placeholders' >&2; exit 1 ;;
  esac
  # Pinggy UDP uses its CLI; SSH host-key options apply only to OpenSSH.
  case "$PINGGY_UDP_COMMAND" in
    '/usr/bin/ssh '*|'ssh '*) echo 'Pinggy UDP requires the CLI, not OpenSSH' >&2; exit 1 ;;
  esac
  case "$PINGGY_UDP_COMMAND" in
    *StrictHostKeyChecking*|*UserKnownHostsFile*) echo 'UDP CLI transport cannot be verified with OpenSSH options' >&2; exit 1 ;;
  esac
  case "$PINGGY_UDP_COMMAND" in
    *'--type udp'*|*'+udp@'*|*' udp@'*) ;;
    *) echo 'Pinggy UDP command must explicitly select UDP mode' >&2; exit 1 ;;
  esac
}

if [ "$mode" = both ] || [ "$mode" = tcp ]; then
  validate_tcp_command
  command -v nc >/dev/null || { echo 'nc is required for TCP tunnel mode' >&2; exit 1; }
  while ! nc -z 127.0.0.1 8443 >/dev/null 2>&1; do sleep 2; done
fi
if [ "$mode" = both ] || [ "$mode" = udp ]; then
  validate_udp_command
  command -v curl >/dev/null || { echo 'curl is required for UDP tunnel mode' >&2; exit 1; }
  while ! curl --connect-timeout 3 --max-time 5 --fail --silent \
    http://127.0.0.1:41339/health_check >/dev/null 2>&1; do sleep 2; done
fi

echo "PINGGY_TUNNEL_MODE=$mode"
pids=
start_mapping() {
  name=$1
  mapping_command=$2
  sh -c "exec $mapping_command" &
  mapping_pid=$!
  pids="${pids:+$pids }$mapping_pid"
  printf 'PINGGY_%s_PID=%s\n' "$name" "$mapping_pid"
}
stop_mappings() {
  for pid in $pids; do
    kill "$pid" 2>/dev/null || true
  done
}
trap 'stop_mappings' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

case "$mode" in
  tcp)
    start_mapping TCP "$PINGGY_TCP_COMMAND"
    wait "$mapping_pid"
    ;;
  udp)
    start_mapping UDP "$PINGGY_UDP_COMMAND"
    wait "$mapping_pid"
    ;;
  both)
    start_mapping TCP "$PINGGY_TCP_COMMAND"
    tcp_pid=$mapping_pid
    start_mapping UDP "$PINGGY_UDP_COMMAND"
    udp_pid=$mapping_pid
    # Keep both mappings paired: if either exits, stop the other and let launchd restart.
    while kill -0 "$tcp_pid" 2>/dev/null && kill -0 "$udp_pid" 2>/dev/null; do
      sleep 2
    done
    echo 'A Pinggy mapping exited; stopping the pair for supervisor restart' >&2
    stop_mappings
    wait "$tcp_pid" 2>/dev/null || true
    wait "$udp_pid" 2>/dev/null || true
    exit 1
    ;;
esac

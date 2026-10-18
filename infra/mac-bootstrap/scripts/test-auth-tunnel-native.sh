#!/bin/sh
set -eu
umask 077
mode=${1:-http}
case "$mode" in http|tcp) ;; *) echo 'Mode must be http or tcp' >&2; exit 1 ;; esac
test "$(id -un)" = portals-svc || { echo 'Run as portals-svc' >&2; exit 1; }
pin=/Users/portals-svc/.ssh/known_hosts
identity=/Users/portals-svc/.ssh/pinggy-test-ed25519
test -r "$pin" || { echo 'Service-account known_hosts is unreadable' >&2; exit 1; }
/usr/bin/ssh-keygen -F '[free.pinggy.io]:443' -f "$pin" >/dev/null || {
  echo 'No existing pinned key for [free.pinggy.io]:443; verify the gateway key before proceeding' >&2
  exit 1
}
if ! test -e "$identity"; then
  /usr/bin/ssh-keygen -q -t ed25519 -N '' -C portals-pinggy-test -f "$identity"
fi
if test "$mode" = tcp; then
  exec /usr/bin/ssh -tt -p 443 -i "$identity" \
    -o IdentitiesOnly=yes -o BatchMode=yes -o ExitOnForwardFailure=yes \
    -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$pin" \
    -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
    -R 0:127.0.0.1:8443 tcp@free.pinggy.io
fi
# OpenSSH forwards the local HTTPS stream unchanged to Pinggy, which applies
# upstream TLS/SNI and Host rewriting. Its debugger stays on host loopback.
exec /usr/bin/ssh -tt -p 443 -i "$identity" \
  -o IdentitiesOnly=yes -o BatchMode=yes -o ExitOnForwardFailure=yes \
  -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$pin" \
  -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
  -L 127.0.0.1:4300:127.0.0.1:4300 -R 0:127.0.0.1:8443 \
  free.pinggy.io x:localServerTls:auth.portals.works u:Host:auth.portals.works

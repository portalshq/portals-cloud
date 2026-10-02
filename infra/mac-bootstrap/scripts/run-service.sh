#!/bin/sh
set -eu

PATH="$PATH:/usr/local/bin:/opt/homebrew/bin"
export PATH

role=${1:?service role is required}
root=/Users/portals-svc/portals/infra/mac-bootstrap
env_file=${MAC_RELEASE_ENV:-/Users/portals-svc/portals-release.env}
test -r "$env_file" || { echo 'MAC_RELEASE_ENV is unreadable' >&2; exit 1; }
set -a
. "$env_file"
set +a
compose="docker compose --env-file $env_file -f $root/templates/compose.prod.yaml"

wait_http() {
  url=$1
  while ! curl --fail --silent "$url" >/dev/null 2>&1; do sleep 2; done
}

case "$role" in
  auth) exec sh -c "$compose up auth-gateway" ;;
  lore) wait_http http://127.0.0.1:8085/healthz; exec sh -c "$compose up lore" ;;
  caddy) wait_http http://127.0.0.1:41339/health; exec sh -c "$compose up caddy" ;;
  *) echo "unknown service role: $role" >&2; exit 1 ;;
esac

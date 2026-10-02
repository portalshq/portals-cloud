#!/bin/sh
set -eu

PATH="$PATH:/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin"
export PATH

role=${1:?service role is required}
root=/Users/portals-svc/portals/infra/mac-bootstrap
env_file=${MAC_RELEASE_ENV:-/Users/portals-svc/portals-release.env}
test -r "$env_file" || { echo 'MAC_RELEASE_ENV is unreadable' >&2; exit 1; }
set -a
. "$env_file"
set +a

wait_http() {
  url=$1
  while ! curl --connect-timeout 3 --max-time 5 --fail --silent "$url" >/dev/null 2>&1; do sleep 2; done
}

case "$role" in
  auth) service=auth-gateway ;;
  lore)
    while ! curl --connect-timeout 3 --max-time 5 --fail --silent \
      --resolve "${AUTH_DOMAIN}:8443:127.0.0.1" "https://${AUTH_DOMAIN}:8443/.well-known/jwks.json" >/dev/null 2>&1; do sleep 2; done
    service=lore ;;
  caddy) wait_http http://127.0.0.1:8085/healthz; service=caddy ;;
  *) echo "unknown service role: $role" >&2; exit 1 ;;
esac
exec docker compose --env-file "$env_file" -f "$root/templates/compose.prod.yaml" up "$service"

#!/bin/sh
set -eu

PATH="$PATH:/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin"
export PATH

DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE=${MAC_RELEASE_ENV:?MAC_RELEASE_ENV is required}
test -r "$ENV_FILE" || { echo 'MAC_RELEASE_ENV is unreadable' >&2; exit 1; }
export MAC_RELEASE_ENV="$ENV_FILE"
set -a
. "$ENV_FILE"
set +a
compose() { docker compose --env-file "$ENV_FILE" -f "$DIR/templates/compose.prod.yaml" "$@"; }
cd "$DIR"
"$DIR/scripts/bootstrap.sh"

wait_http() {
  url=$1
  attempts=${2:-30}
  while [ "$attempts" -gt 0 ]; do
    if curl --connect-timeout 3 --max-time 5 --fail --silent --show-error "$url" >/dev/null 2>&1; then return 0; fi
    attempts=$((attempts - 1))
    sleep 2
  done
  echo "Timed out waiting for $url" >&2
  return 1
}

compose up -d auth-gateway
wait_http http://127.0.0.1:8085/healthz
wait_http http://127.0.0.1:8085/.well-known/jwks.json

compose up -d caddy
# Lore fetches HTTPS JWKS at startup. Keep this dependency local, with real
# hostname/certificate verification, instead of relying on the public tunnel.
curl --connect-timeout 3 --max-time 10 --retry 10 --retry-connrefused --retry-delay 2 \
  --fail --silent --show-error --resolve "${AUTH_DOMAIN}:8443:127.0.0.1" \
  "https://${AUTH_DOMAIN}:8443/.well-known/jwks.json" >/dev/null
compose up -d lore
wait_http http://127.0.0.1:41339/health_check

echo 'Mac services started in dependency order; external Pinggy and protocol checks remain required.'

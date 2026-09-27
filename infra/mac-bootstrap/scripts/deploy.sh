#!/bin/sh
set -eu

DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE=${MAC_RELEASE_ENV:?MAC_RELEASE_ENV is required}
COMPOSE="docker compose --env-file $ENV_FILE -f $DIR/templates/compose.prod.yaml"
cd "$DIR"
node "$DIR/scripts/check-release.mjs"
"$DIR/scripts/check-images.sh"

wait_http() {
  url=$1
  attempts=${2:-30}
  while [ "$attempts" -gt 0 ]; do
    if curl --fail --silent --show-error "$url" >/dev/null 2>&1; then return 0; fi
    attempts=$((attempts - 1))
    sleep 2
  done
  echo "Timed out waiting for $url" >&2
  return 1
}

$COMPOSE up -d auth-gateway
wait_http http://127.0.0.1:8085/health

$COMPOSE up -d lore
wait_http http://127.0.0.1:41339/health

$COMPOSE up -d delivery-worker
wait_http http://127.0.0.1:8090/health
wait_http http://127.0.0.1:8090/ready

$COMPOSE up -d caddy
echo 'Mac services started in dependency order; external Pinggy and protocol checks remain required.'

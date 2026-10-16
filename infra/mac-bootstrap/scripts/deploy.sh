#!/bin/sh
set -eu

PATH="$PATH:/usr/local/bin:/opt/homebrew/bin"
export PATH

DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE=${MAC_RELEASE_ENV:?MAC_RELEASE_ENV is required}
test -r "$ENV_FILE" || { echo 'MAC_RELEASE_ENV is unreadable' >&2; exit 1; }
export MAC_RELEASE_ENV="$ENV_FILE"
set -a
. "$ENV_FILE"
set +a
COMPOSE="docker compose --env-file $ENV_FILE -f $DIR/templates/compose.prod.yaml"
cd "$DIR"
"$DIR/scripts/bootstrap.sh"

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
wait_http http://127.0.0.1:8085/healthz

$COMPOSE up -d lore
wait_http http://127.0.0.1:41339/health

$COMPOSE up -d caddy
echo 'Mac services started in dependency order; external Pinggy and protocol checks remain required.'

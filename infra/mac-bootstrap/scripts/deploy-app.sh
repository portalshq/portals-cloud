#!/bin/sh
# Start one service-account-owned application from its pinned Compose file.
# Run as portals-svc after provision-docker-runtime.sh has installed the socket ACL.
set -eu

PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
export PATH

compose_file=${APP_COMPOSE_FILE:?APP_COMPOSE_FILE is required}
project=${APP_PROJECT:?APP_PROJECT is required}
service=${APP_SERVICE:-}
health_url=${APP_HEALTH_URL:-}
DOCKER_HOST=${DOCKER_HOST:-unix:///Users/andresb/.docker/run/docker.sock}
export DOCKER_HOST

test "$(id -un)" = portals-svc || { echo 'Run deploy-app.sh as portals-svc' >&2; exit 1; }
test -r "$compose_file" || { echo "Compose file is unreadable: $compose_file" >&2; exit 1; }
grep -q 'REPLACE_WITH_VERIFIED_DIGEST' "$compose_file" && {
  echo 'Compose file still contains an image digest placeholder' >&2
  exit 1
}

compose() { docker compose -p "$project" -f "$compose_file" "$@"; }
compose config >/dev/null
if [ -n "$service" ]; then
  compose up -d "$service"
else
  compose up -d
fi
compose ps

if [ -n "$health_url" ]; then
  attempts=60
  while [ "$attempts" -gt 0 ]; do
    if curl --connect-timeout 3 --max-time 5 --fail --silent --show-error "$health_url" >/dev/null 2>&1; then
      echo "APP_HEALTHY url=$health_url"
      exit 0
    fi
    attempts=$((attempts - 1))
    sleep 2
  done
  echo "Application health check timed out: $health_url" >&2
  compose ps
  exit 1
fi

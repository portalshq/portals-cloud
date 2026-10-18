#!/bin/sh
set -eu

# Restricted noninteractive entry point. This runs as portals-svc, never root,
# and intentionally emits only service metadata or validator diagnostics.
PATH=/Users/Shared/portals-tools/bin:/Users/Shared/portals-tools/node_modules/.bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin
export PATH
ROOT=/Users/portals-svc/portals/infra/mac-bootstrap
ENV_FILE=/Users/portals-svc/portals-release.env

fail() { printf '%s\n' "$1" >&2; exit 1; }
[ "$(id -un)" = portals-svc ] || fail 'remote gate must run as portals-svc'

cd "$ROOT"

case "${SSH_ORIGINAL_COMMAND:-}" in
  status|preflight|repair-lore-auth-discovery) action=$SSH_ORIGINAL_COMMAND ;;
  *) action=${1:-} ;;
esac
case "$action" in
  status)
    /usr/local/bin/docker ps -a \
      --filter name=templates-auth-gateway \
      --filter name=templates-lore \
      --filter name=templates-caddy \
      --format 'table {{.Names}}\t{{.Image}}\t{{.State}}\t{{.Status}}'
    ;;
  preflight)
    [ -r "$ENV_FILE" ] || fail 'release manifest is unreadable to portals-svc'
    set -a
    . "$ENV_FILE"
    set +a
    node "$ROOT/scripts/check-release.mjs"
    ;;
  repair-lore-auth-discovery)
    [ -r "$ENV_FILE" ] || fail 'release manifest is unreadable to portals-svc'
    set -a
    . "$ENV_FILE"
    set +a
    node "$ROOT/scripts/repair-lore-auth-discovery.mjs"
    ;;
  *)
    fail 'allowed actions: status, preflight, repair-lore-auth-discovery'
    ;;
esac

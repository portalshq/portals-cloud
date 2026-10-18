#!/bin/sh
set -eu

# Installed root-owned under /private/etc/portals-ops and invoked only through
# exact sudoers entries as portals-svc. Accepts one fixed action, never shell
# text, a path, a credential, or an image identifier from the caller.
PATH=/Users/Shared/portals-tools/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin
HOME=/Users/portals-svc
LANG=C
LC_ALL=C
export PATH HOME LANG LC_ALL

ROOT=/Users/portals-svc/portals/infra/mac-bootstrap
RELEASE=/Users/portals-svc/portals-release.env
DEPLOY=$ROOT/scripts/deploy-promoted-service.mjs
AUTH_TEST=$ROOT/scripts/test-auth-key-lifecycle.mjs
DEPLOY_SHA=00c0744bcf8c4d7a84fb9acb53962aa39c1af43d7d8446302f5383cd45733219
AUTH_TEST_SHA=18dd032889ad9c8e45202695a0515057c25ad7512b9cdd094a15c1497c53bf18
RECEIPTS=/Users/portals-svc/portals/infra/lore/verified-dockerhub-images.json

fail() { printf '%s\n' "$1" >&2; exit 1; }
[ "$(/usr/bin/id -un)" = portals-svc ] || fail 'The acceptance gate must run as portals-svc.'
[ "$#" -eq 1 ] || fail 'Exactly one fixed acceptance action is required.'
[ -d "$ROOT" ] && [ ! -L "$ROOT" ] || fail 'Mac bootstrap checkout is missing or unsafe.'
[ -f "$RELEASE" ] && [ ! -L "$RELEASE" ] && [ -r "$RELEASE" ] || fail 'Private release manifest is unavailable.'

check_file() {
  file=$1
  expected=$2
  [ -f "$file" ] && [ ! -L "$file" ] && [ -r "$file" ] || fail 'Reviewed action script is missing or unsafe.'
  actual=$(/usr/bin/shasum -a 256 "$file" | /usr/bin/awk '{print $1}')
  [ "$actual" = "$expected" ] || fail 'Installed action script differs from the reviewed version.'
}

deploy() {
  check_file "$DEPLOY" "$DEPLOY_SHA"
  exec /usr/bin/env -i PATH="$PATH" HOME="$HOME" LANG=C LC_ALL=C \
    MAC_BOOTSTRAP_ROOT="$ROOT" MAC_RELEASE_ENV="$RELEASE" \
    MAC_RELEASE_RECEIPTS="$RECEIPTS" DOCKER_BIN=/usr/local/bin/docker \
    DOCKER_COMPOSE_BIN=/usr/local/bin/docker-compose \
    /usr/local/bin/node "$DEPLOY" "$@"
}

case "$1" in
  deploy-auth-plan)
    deploy auth-gateway --plan
    ;;
  deploy-lore-plan)
    deploy lore --plan
    ;;
  deploy-auth)
    deploy auth-gateway
    ;;
  deploy-lore)
    deploy lore
    ;;
  auth-fixture-test)
    check_file "$AUTH_TEST" "$AUTH_TEST_SHA"
    exec /usr/bin/env -i PATH="$PATH" HOME="$HOME" LANG=C LC_ALL=C \
      /usr/local/bin/node "$AUTH_TEST" --create-isolated-fixture
    ;;
  *)
    fail 'Allowed actions: deploy-auth-plan, deploy-lore-plan, deploy-auth, deploy-lore, auth-fixture-test.'
    ;;
esac

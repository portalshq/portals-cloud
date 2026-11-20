#!/bin/sh
# Verifies the two public Channels application origins without printing secrets.
set -eu

BEARS_ORIGIN=${BEARS_ORIGIN:-https://bears.portals.works}
EBOOK_ORIGIN=${EBOOK_ORIGIN:-https://25thchapter.portals.works}

check() {
  name=$1
  url=$2
  expected=$3
  code=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
    --connect-timeout 5 --max-time 15 "$url")
  [ "$code" = "$expected" ] || { echo "$name failed: HTTP $code" >&2; exit 1; }
  echo "$name=PASS"
}

check BEARS_HEALTH "$BEARS_ORIGIN/api/health" 200
check BEARS_CHANNEL "$BEARS_ORIGIN/api/channel" 200
check BEARS_BUNDLE "$BEARS_ORIGIN/channel-app/watch.js" 200
check EBOOK_HEALTH "$EBOOK_ORIGIN/health" 200
check EBOOK_CHANNEL "$EBOOK_ORIGIN/api/channel" 200
check EBOOK_BUNDLE "$EBOOK_ORIGIN/channel-app/watch.js" 200
node "$(dirname "$0")/check-cloudflare-websocket.mjs"

echo 'CLOUDFLARE_APP_ORIGINS=PASS'

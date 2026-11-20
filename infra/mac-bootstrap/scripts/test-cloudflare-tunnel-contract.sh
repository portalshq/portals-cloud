#!/bin/sh
set -eu

DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
MANAGER=$DIR/scripts/manage-cloudflare-tunnel.sh
CHECK=$DIR/scripts/check-cloudflare-app-origins.sh
WS_CHECK=$DIR/scripts/check-cloudflare-websocket.mjs
PLIST=$DIR/launchd/com.portals.cloudflared.plist
README=$DIR/README.md

sh -n "$MANAGER"
sh -n "$CHECK"
node --check "$WS_CHECK"
plutil -lint "$PLIST" >/dev/null
! grep -q '<key>UserName</key>' "$PLIST"
grep -q -- '--token-file' "$PLIST"
grep -q 'Library/LaunchAgents' "$MANAGER"
! grep -q 'sudo ' "$MANAGER"
! grep -Eq 'eyJ[A-Za-z0-9_-]{40,}' "$DIR"/launchd/com.portals.cloudflared.plist "$MANAGER" "$CHECK" "$WS_CHECK"
grep -q 'https://bears.portals.works' "$README"
grep -q 'https://25thchapter.portals.works' "$README"
grep -q 'http://127.0.0.1:3001' "$README"
grep -q 'http://127.0.0.1:5001' "$README"

echo 'CLOUDFLARE_TUNNEL_CONTRACT=PASS'

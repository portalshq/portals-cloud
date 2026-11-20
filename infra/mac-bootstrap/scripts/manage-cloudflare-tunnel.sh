#!/bin/sh
# Installs and manages the andresb-owned Cloudflare connector for the public
# Channels application origins. Cloudflare owns hostname routing; this process
# only maintains the outbound tunnel and never reads application secrets.
set -eu

LABEL=com.portals.cloudflared
OWNER=andresb
BIN=/usr/local/bin/cloudflared
TOKEN_DIR=/Users/andresb/.config/cloudflared
TOKEN_FILE=$TOKEN_DIR/portals-andresb-web.token
LOG_DIR=/Users/andresb/Library/Logs
PLIST_TARGET=/Users/andresb/Library/LaunchAgents/$LABEL.plist
DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PLIST_SOURCE=$DIR/launchd/$LABEL.plist

usage() {
  echo "Usage: $0 install|start|stop|status|uninstall" >&2
  exit 2
}

require_owner() {
  [ "$(id -un)" = "$OWNER" ] || { echo "Run as $OWNER" >&2; exit 1; }
}

version_number() {
  "$BIN" --version | awk '{ for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]{4}\.[0-9]+\.[0-9]+$/) { print $i; exit } }'
}

version_supported() {
  version=$1
  year=${version%%.*}
  rest=${version#*.}
  month=${rest%%.*}
  [ "$year" -gt 2025 ] || { [ "$year" -eq 2025 ] && [ "$month" -ge 4 ]; }
}

check_token() {
  [ -f "$TOKEN_FILE" ] && [ ! -L "$TOKEN_FILE" ] || { echo "Tunnel token is missing or unsafe: $TOKEN_FILE" >&2; exit 1; }
  [ "$(stat -f '%Su' "$TOKEN_DIR")" = "$OWNER" ] || { echo "Token directory must be owned by $OWNER" >&2; exit 1; }
  [ "$(stat -f '%Lp' "$TOKEN_DIR")" = 700 ] || { echo 'Token directory must have mode 700' >&2; exit 1; }
  [ "$(stat -f '%Su' "$TOKEN_FILE")" = "$OWNER" ] || { echo "Token file must be owned by $OWNER" >&2; exit 1; }
  [ "$(stat -f '%Lp' "$TOKEN_FILE")" = 600 ] || { echo 'Token file must have mode 600' >&2; exit 1; }
  lines=$(wc -l < "$TOKEN_FILE" | tr -d ' ')
  [ "$lines" -eq 1 ] && [ "$(wc -c < "$TOKEN_FILE" | tr -d ' ')" -ge 80 ] || { echo 'Token file must contain exactly one non-empty connector token' >&2; exit 1; }
}

check_binary() {
  [ -x "$BIN" ] || { echo "cloudflared is required at $BIN (install with: brew install cloudflared)" >&2; exit 1; }
  version=$(version_number)
  [ -n "$version" ] && version_supported "$version" || { echo 'cloudflared 2025.4.0 or newer is required for --token-file' >&2; exit 1; }
}

service_status() {
  if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
    echo 'CLOUDFLARED_SERVICE=loaded'
  else
    echo 'CLOUDFLARED_SERVICE=not_loaded'
  fi
  for spec in 'BEARS http://127.0.0.1:3001/api/health' 'EBOOK http://127.0.0.1:5001/health'; do
    name=${spec%% *}
    url=${spec#* }
    if curl --silent --show-error --fail --max-time 5 "$url" >/dev/null 2>&1; then
      echo "${name}_ORIGIN=healthy"
    else
      echo "${name}_ORIGIN=unavailable"
    fi
  done
  for spec in 'BEARS 3001' 'EBOOK 5001'; do
    name=${spec%% *}
    port=${spec#* }
    listeners=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -F n 2>/dev/null | sed -n 's/^n//p' || true)
    if [ -z "$listeners" ]; then
      echo "${name}_LISTENER=absent"
    elif printf '%s\n' "$listeners" | grep -Eqv '^(127\.0\.0\.1|\[::1\]):[0-9]+$'; then
      echo "${name}_LISTENER=exposed"
    else
      echo "${name}_LISTENER=loopback"
    fi
  done
}

action=${1:-}
case "$action" in
  install)
    require_owner
    check_binary
    check_token
    [ -f "$PLIST_SOURCE" ] || { echo "LaunchAgent source is missing: $PLIST_SOURCE" >&2; exit 1; }
    mkdir -p "$LOG_DIR"
    mkdir -p "$(dirname "$PLIST_TARGET")"
    chmod 700 "$LOG_DIR"
    plutil -lint "$PLIST_SOURCE" >/dev/null
    install -m 644 "$PLIST_SOURCE" "$PLIST_TARGET"
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST_TARGET"
    launchctl enable "gui/$(id -u)/$LABEL"
    launchctl kickstart -k "gui/$(id -u)/$LABEL"
    echo 'CLOUDFLARED_INSTALL=complete'
    service_status
    ;;
  start)
    require_owner
    check_binary
    check_token
    [ -f "$PLIST_TARGET" ] || { echo 'Install the connector first' >&2; exit 1; }
    if ! launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
      launchctl bootstrap "gui/$(id -u)" "$PLIST_TARGET"
    fi
    launchctl enable "gui/$(id -u)/$LABEL"
    launchctl kickstart -k "gui/$(id -u)/$LABEL"
    service_status
    ;;
  stop)
    require_owner
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    echo 'CLOUDFLARED_STOP=complete'
    ;;
  status)
    check_binary
    service_status
    ;;
  uninstall)
    require_owner
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    if [ -f "$PLIST_TARGET" ]; then rm "$PLIST_TARGET"; fi
    echo "CLOUDFLARED_UNINSTALL=complete token_preserved=$TOKEN_FILE"
    ;;
  *) usage ;;
esac

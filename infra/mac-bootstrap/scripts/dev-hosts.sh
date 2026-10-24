#!/bin/sh
set -eu

# Manage loopback DNS overrides for local Portals development.
#
#   dev-hosts.sh on      add    127.0.0.1 auth.portals.works lore.portals.works
#   dev-hosts.sh off     remove the managed block
#   dev-hosts.sh status  print whether the block is installed
#
# The entries are wrapped in BEGIN/END markers so off only ever removes what
# on wrote — lines outside the block are never touched. Writes need sudo;
# status does not.
#
# Pair with: ssh -N -L 8443:127.0.0.1:8443 <andresb-host>
# so auth.portals.works:8443 reaches the deployed Caddy with valid SNI.

HOSTS_FILE=/etc/hosts
BEGIN='# BEGIN portals-dev-hosts'
END='# END portals-dev-hosts'
ENTRIES='127.0.0.1 auth.portals.works lore.portals.works'

usage() { sed -n '3,10p' "$0"; exit "${1:-0}"; }

installed() { grep -qF "$BEGIN" "$HOSTS_FILE"; }

flush_dns() {
  if [ "$(uname -s)" = Darwin ]; then
    dscacheutil -flushcache 2>/dev/null || true
    killall -HUP mDNSResponder 2>/dev/null || true
  fi
}

case "${1:-}" in
  on)
    if installed; then
      echo "dev-hosts: already installed"
      exit 0
    fi
    tmp=$(mktemp)
    trap 'rm -f "$tmp"' EXIT HUP INT TERM
    cat "$HOSTS_FILE" > "$tmp"
    printf '%s\n%s\n%s\n' "$BEGIN" "$ENTRIES" "$END" >> "$tmp"
    sudo cp "$tmp" "$HOSTS_FILE"
    sudo chmod 644 "$HOSTS_FILE"
    flush_dns
    echo "dev-hosts: installed $ENTRIES"
    ;;
  off)
    if ! installed; then
      echo "dev-hosts: not installed"
      exit 0
    fi
    tmp=$(mktemp)
    trap 'rm -f "$tmp"' EXIT HUP INT TERM
    awk -v begin="$BEGIN" -v end="$END" '$0==begin{skip=1;next} $0==end{skip=0;next} !skip' "$HOSTS_FILE" > "$tmp"
    sudo cp "$tmp" "$HOSTS_FILE"
    sudo chmod 644 "$HOSTS_FILE"
    flush_dns
    echo "dev-hosts: removed"
    ;;
  status)
    if installed; then
      sed -n "/$(printf '%s' "$BEGIN" | sed 's/[][\.*^$/]/\\&/g')/,/$(printf '%s' "$END" | sed 's/[][\.*^$/]/\\&/g')/p" "$HOSTS_FILE"
    else
      echo "dev-hosts: not installed"
      exit 1
    fi
    ;;
  -h|--help|help) usage ;;
  *) usage 1 ;;
esac

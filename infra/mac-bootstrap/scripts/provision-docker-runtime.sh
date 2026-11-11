#!/bin/sh
# Provisions portals-svc access to the andresb-owned Docker Desktop daemon.
# Run once on the host as andresb (admin); re-run after Docker Desktop
# upgrades to refresh plugin binaries. Idempotent.
#
# What it does:
#   1. Copies Docker Desktop's CLI plugins (buildx, compose, ...) into
#      /usr/local/lib/docker/cli-plugins, a standard plugin search path, so
#      `docker buildx` and `docker compose` resolve for every user including
#      portals-svc. Copies, not symlinks, so portals-svc never traverses
#      andresb's home.
#   2. Normalizes the targeted ACL on andresb's Docker socket so only
#      portals-svc gains API access. Docker API access is full daemon
#      control; this grant is required because bootstrap.sh and the launchd
#      services run as portals-svc.
#   3. Installs a root LaunchDaemon that re-applies the ACL whenever Docker
#      Desktop recreates the socket (restart/upgrade). Without it the ACL is
#      silently dropped on each Desktop restart.
#
# DOCKER_HOST itself is set by deploy.sh (defaulting to the andresb socket)
# and by the com.portals.* launchd plists.
set -eu

SOCKET=${PORTALS_DOCKER_SOCKET:-/Users/andresb/.docker/run/docker.sock}
SOCKET_OWNER=${PORTALS_DOCKER_SOCKET_OWNER:-andresb}
SERVICE_USER=${PORTALS_SERVICE_USER:-portals-svc}
PLUGIN_SOURCE=/Applications/Docker.app/Contents/Resources/cli-plugins
PLUGIN_TARGET=/usr/local/lib/docker/cli-plugins
HELPER_TARGET=/usr/local/libexec/portals
HELPER_SCRIPT="$HELPER_TARGET/restore-docker-socket-acl.sh"
PLIST_LABEL=com.portals.docker-socket-acl
PLIST_TARGET=/Library/LaunchDaemons/$PLIST_LABEL.plist
DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

[ "$(id -un)" = "$SOCKET_OWNER" ] || { echo "Run as $SOCKET_OWNER (the Docker Desktop account)" >&2; exit 1; }
[ -d "$PLUGIN_SOURCE" ] || { echo "Docker Desktop plugins not found at $PLUGIN_SOURCE" >&2; exit 1; }
[ -S "$SOCKET" ] || { echo "Docker socket not found at $SOCKET; is Docker Desktop running?" >&2; exit 1; }

echo '==> Installing Docker CLI plugins system-wide'
sudo mkdir -p "$PLUGIN_TARGET"
for plugin in "$PLUGIN_SOURCE"/docker-*; do
  [ -f "$plugin" ] || continue
  sudo cp -f "$plugin" "$PLUGIN_TARGET/"
  sudo chmod 755 "$PLUGIN_TARGET/$(basename "$plugin")"
done

echo '==> Installing ACL restore helper (root-owned; portals-svc cannot modify it)'
sudo mkdir -p "$HELPER_TARGET"
sudo cp -f "$DIR/scripts/restore-docker-socket-acl.sh" "$HELPER_SCRIPT"
sudo chown root:wheel "$HELPER_SCRIPT"
sudo chmod 755 "$HELPER_SCRIPT"

echo "==> Installing LaunchDaemon $PLIST_LABEL"
sudo cp -f "$DIR/launchd/$PLIST_LABEL.plist" "$PLIST_TARGET"
sudo chown root:wheel "$PLIST_TARGET"
sudo chmod 644 "$PLIST_TARGET"
sudo launchctl bootout "system/$PLIST_LABEL" 2>/dev/null || true
sudo launchctl bootstrap system "$PLIST_TARGET"

echo "==> Applying socket ACL for $SERVICE_USER"
"$HELPER_SCRIPT"

echo '==> Verifying'
sudo -u "$SERVICE_USER" env HOME="/Users/$SERVICE_USER" DOCKER_HOST="unix://$SOCKET" \
  docker version --format 'server={{.Server.Version}}' >/dev/null \
  && echo "portals-svc can reach the Docker daemon"
sudo -u "$SERVICE_USER" docker buildx version >/dev/null \
  && echo 'docker buildx resolves for portals-svc'
sudo -u "$SERVICE_USER" docker compose version >/dev/null \
  && echo 'docker compose resolves for portals-svc'
echo 'Done. Docker access for portals-svc is provisioned and self-healing.'

#!/bin/sh
# Re-applies the targeted Docker socket ACL for portals-svc. Invoked by the
# com.portals.docker-socket-acl LaunchDaemon whenever Docker Desktop
# recreates the socket, and once by provision-docker-runtime.sh.
# Installed root-owned at /usr/local/libexec/portals/ — portals-svc must not
# be able to modify a script that runs as root.
set -eu

SOCKET=${PORTALS_DOCKER_SOCKET:-/Users/andresb/.docker/run/docker.sock}
SERVICE_USER=${PORTALS_SERVICE_USER:-portals-svc}

# Socket may not exist yet while Docker Desktop is still starting; the
# LaunchDaemon's WatchPaths will fire again when it appears.
[ -S "$SOCKET" ] || exit 0

if /bin/ls -le "$SOCKET" | /usr/bin/grep -q "user:$SERVICE_USER allow write"; then
  exit 0
fi

/bin/chmod +a "$SERVICE_USER allow write" "$SOCKET"
echo "restored docker socket ACL: $SERVICE_USER allow write on $SOCKET"

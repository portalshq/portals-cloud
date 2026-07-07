#!/bin/sh
# wait-for.sh HOST:PORT [-- COMMAND]
# Polls TCP until the host:port accepts a connection, then optionally execs COMMAND.
# Used by services that need a dependency to be ready before starting.
TIMEOUT=60
HOST=$(echo "$1" | cut -d: -f1)
PORT=$(echo "$1" | cut -d: -f2)
shift

echo "[wait-for] waiting for $HOST:$PORT..."
for i in $(seq 1 $TIMEOUT); do
  if nc -z "$HOST" "$PORT" 2>/dev/null; then
    echo "[wait-for] $HOST:$PORT is up after ${i}s"
    if [ "$1" = "--" ]; then shift; exec "$@"; fi
    exit 0
  fi
  sleep 1
done
echo "[wait-for] timeout waiting for $HOST:$PORT"
exit 1

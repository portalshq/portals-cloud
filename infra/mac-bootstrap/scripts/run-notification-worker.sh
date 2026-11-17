#!/bin/sh
set -eu

PATH="$PATH:/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin"
export PATH
env_file=${NOTIFICATIONS_WORKER_ENV:-/Users/portals-svc/notification-worker.env}
test -r "$env_file" || { echo 'Notification worker environment is unreadable' >&2; exit 1; }
set -a
. "$env_file"
set +a
cd /Users/portals-svc/portals/packages/capability-email-notifications
exec npm run worker

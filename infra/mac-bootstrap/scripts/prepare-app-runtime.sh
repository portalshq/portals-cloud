#!/bin/sh
# Allow Docker Desktop's andresb daemon to read only non-secret bind mounts.
# Run as portals-svc; never grant Docker Desktop access to secret files.
set -eu

docker_user=${APP_DOCKER_USER:-andresb}
registry=${APP_REGISTRY_FILE:?APP_REGISTRY_FILE is required}
registry_dir=$(CDPATH= cd -- "$(dirname -- "$registry")" && pwd)
state_dir=$(CDPATH= cd -- "$registry_dir/.." && pwd)
service_root=/Users/portals-svc

test "$(id -un)" = portals-svc || { echo 'Run prepare-app-runtime.sh as portals-svc' >&2; exit 1; }
test -r "$registry" || { echo "Registry file is unreadable: $registry" >&2; exit 1; }
test "$(stat -f '%Su' "$registry")" = portals-svc || { echo 'Registry file must be service-account-owned' >&2; exit 1; }

# Docker Desktop needs directory traversal and file read access; this is
# intentionally limited to the registry path and does not cover secrets.
grant_dir() {
  path=$1
  /bin/ls -lde "$path" | /usr/bin/grep -Fq "user:$docker_user" ||
    /bin/chmod +a "$docker_user allow read,readattr,readextattr,list,search" "$path"
}
grant_file() {
  path=$1
  /bin/ls -le "$path" | /usr/bin/grep -Fq "user:$docker_user" ||
    /bin/chmod +a "$docker_user allow read,readattr,readextattr" "$path"
}
grant_dir "$service_root"
grant_dir "$state_dir"
grant_dir "$registry_dir"
grant_file "$registry"

echo "APP_RUNTIME_ACL_READY user=$docker_user path=$registry"

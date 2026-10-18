#!/bin/sh
set -eu

test "$(id -un)" = portals-svc || { echo 'Run as portals-svc' >&2; exit 1; }
: "${MAC_RELEASE_ENV:?MAC_RELEASE_ENV is required}"
test -r "$MAC_RELEASE_ENV" || { echo 'MAC_RELEASE_ENV is unreadable' >&2; exit 1; }
# The release file is an operator-maintained shell assignment file. Its values
# are intentionally not printed by this script.
set -a
. "$MAC_RELEASE_ENV"
set +a

grant_acl() {
  target=$1
  rights=$2
  test -e "$target" || { echo "Required Docker source is missing: $target" >&2; exit 1; }
  acl=$(ls -lde "$target")
  if ! printf '%s\n' "$acl" | grep -F "andresb allow $rights" >/dev/null 2>&1; then
    chmod +a "andresb allow $rights" "$target"
  fi
}

check_owned_directory() {
  target=$1
  test -d "$target" && test ! -L "$target" || { echo "Expected a real directory: $target" >&2; exit 1; }
  test "$(stat -f '%Su' "$target")" = portals-svc || { echo "Directory is not owned by portals-svc: $target" >&2; exit 1; }
}

check_owned_file() {
  target=$1
  test -f "$target" && test ! -L "$target" || { echo "Expected a regular file: $target" >&2; exit 1; }
  test "$(stat -f '%Su' "$target")" = portals-svc || { echo "File is not owned by portals-svc: $target" >&2; exit 1; }
}

checkout=/Users/portals-svc/portals/infra/mac-bootstrap
for path in /Users/portals-svc/portals "$checkout/../" "$checkout"; do
  check_owned_directory "$path"
done
check_owned_directory "$checkout/templates"
check_owned_file "$checkout/templates/Caddyfile"
# Docker Desktop's host-side filesystem bridge must enumerate each directory
# component while resolving a bind source. Grant list/search only on these two
# parent directories; the narrower child ACLs below still govern file reads.
grant_acl /Users/portals-svc/portals 'list,search'
grant_acl "$checkout/../" 'search'
grant_acl "$checkout" 'search'
grant_acl "$checkout/templates" 'list,search,readattr,readextattr,readsecurity'
grant_acl "$checkout/templates/Caddyfile" 'read,readattr,readextattr,readsecurity'

for variable in AUTH_SECRET_DIR CADDY_CERT_DIR; do
  case "$variable" in
    AUTH_SECRET_DIR) directory=${AUTH_SECRET_DIR:?AUTH_SECRET_DIR is required} ;;
    CADDY_CERT_DIR) directory=${CADDY_CERT_DIR:?CADDY_CERT_DIR is required} ;;
  esac
  case "$directory" in
    /Users/portals-svc/*) ;;
    *) echo "$variable must be under /Users/portals-svc" >&2; exit 1 ;;
  esac
  check_owned_directory "$directory"
  grant_acl "$directory" 'read,list,search,readattr,readextattr,readsecurity,file_inherit,directory_inherit'
done

check_owned_directory /Users/portals-svc/secrets
grant_acl /Users/portals-svc/secrets 'list,search'

for filename in signing-key api-key-pepper; do
  path=$AUTH_SECRET_DIR/$filename
  check_owned_file "$path"
  grant_acl "$path" 'read,readattr,readextattr,readsecurity'
done

for filename in fullchain.pem privkey.pem; do
  path=$CADDY_CERT_DIR/$filename
  check_owned_file "$path"
  grant_acl "$path" 'read,readattr,readextattr,readsecurity'
done

# Lore's QUIC certificate is intentionally optional until Pinggy's public UDP
# hostname and matching certificate are established. When present, prepare
# the same read-only access for Docker Desktop and future certificate rotation.
if test -d "${LORE_QUIC_CERT_DIR:-}"; then
  check_owned_directory "$LORE_QUIC_CERT_DIR"
  grant_acl "$LORE_QUIC_CERT_DIR" 'read,list,search,readattr,readextattr,readsecurity,file_inherit,directory_inherit'
  for filename in fullchain.pem privkey.pem; do
    path=$LORE_QUIC_CERT_DIR/$filename
    check_owned_file "$path"
    grant_acl "$path" 'read,readattr,readextattr,readsecurity'
  done
  echo 'LORE_QUIC_DOCKER_ACL=ready'
else
  echo 'LORE_QUIC_DOCKER_ACL=pending_certificate_directory'
fi

echo 'DOCKER_DESKTOP_READ_ACLS=ready'

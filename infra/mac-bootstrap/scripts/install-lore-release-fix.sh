#!/bin/sh
set -eu
umask 077

[ "$(id -un)" = portals-svc ] || { echo 'Run as portals-svc' >&2; exit 1; }

shared=/Users/Shared
root=/Users/portals-svc/portals
receipt="$root/infra/lore/verified-dockerhub-images.json"
deploy="$root/infra/mac-bootstrap/scripts/deploy-lore-release.sh"
receipt_backup="$receipt.pre-20261017"
deploy_backup="$deploy.pre-env-precedence-fix-20261017"

hash_file() { /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}'; }

[ "$(hash_file "$shared/verified-dockerhub-images.json")" = d8ab3a9cb9e17e4b5867033583c299a10c2ae5e07d11bd581cf6b3e64bf4a484 ] || {
  echo 'Staged verified Docker Hub receipt checksum mismatch' >&2; exit 1;
}
[ "$(hash_file "$shared/deploy-lore-release.sh")" = 17c13d627d10369d4b28c4d16f86173ff38d46fdb0ee1a27dba5279327ea3fb4 ] || {
  echo 'Staged Lore deploy script checksum mismatch' >&2; exit 1;
}
[ "$(hash_file "$receipt")" = 669baea5d8712b7f79446ee842f0a00487a6aeafb5c0aded27ca73d2d8e9a6e1 ] || {
  echo 'Mac Docker Hub receipt changed; refusing overwrite' >&2; exit 1;
}
[ ! -e "$receipt_backup" ] || { echo 'Receipt backup already exists; refusing overwrite' >&2; exit 1; }
[ ! -e "$deploy_backup" ] || { echo 'Deploy-script backup already exists; refusing overwrite' >&2; exit 1; }

/bin/cp -p "$receipt" "$receipt_backup"
/bin/cp -p "$deploy" "$deploy_backup"
/usr/bin/install -m 644 "$shared/verified-dockerhub-images.json" "$receipt"
/usr/bin/install -m 755 "$shared/deploy-lore-release.sh" "$deploy"

echo 'LORE_DEPLOY_FIX_INSTALLED receipt_backup=preserved deploy_script_backup=preserved'
/bin/sh "$deploy"

#!/bin/sh
set -eu
umask 077

# Run as portals-svc. Update only the Auth candidate pin on andresb after
# verifying the exact approved BOM transferred to /Users/Shared.
[ "$(id -un)" = portals-svc ] || { echo 'Run as portals-svc' >&2; exit 1; }
PATH=/Users/Shared/portals-tools/bin:/Users/Shared/portals-tools/node_modules/.bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin
export PATH

readonly old_image='portalshq/auth-gateway@sha256:7d1c6a95654679990d609f3979710267f7270fec8b2634e626cdadbb2cebd6a2'
readonly new_image='portalshq/auth-gateway@sha256:96a4f5dffb40e22192043ad091e4414a0791408c2f435b98c41ef427f719b162'
readonly expected_bom_sha='c6566bb1e59a63764ebfe7584b15d704daafb455afd1b6a5383b4b5fe89a01b2'
readonly source_bom='/Users/Shared/portals-versions.yaml'
readonly bom='/Users/portals-svc/portals/infra/lore/versions.yaml'
readonly release_env='/Users/portals-svc/portals-release.env'
readonly bom_backup="$bom.pre-auth-stage-pin-20261016"
readonly env_backup="$release_env.pre-auth-stage-pin-20261016"

test -r "$source_bom" && test -r "$bom" && test -r "$release_env" || {
  echo 'Required BOM or release manifest is missing/unreadable' >&2; exit 1;
}
actual_bom_sha=$(/usr/bin/shasum -a 256 "$source_bom" | /usr/bin/awk '{print $1}')
[ "$actual_bom_sha" = "$expected_bom_sha" ] || { echo 'Approved BOM checksum mismatch' >&2; exit 1; }

/usr/bin/grep -F -x "  image: \"$new_image\"" "$source_bom" >/dev/null || {
  echo 'Approved candidate image is absent from the transferred BOM' >&2; exit 1;
}
/usr/bin/grep -F -x "  image: \"$old_image\"" "$bom" >/dev/null || {
  echo 'Host BOM differs from the expected old pin; refusing overwrite' >&2; exit 1;
}
[ "$(/usr/bin/grep -c '^AUTH_GATEWAY_IMAGE_DIGEST=' "$release_env")" -eq 1 ] || {
  echo 'Release manifest must contain exactly one Auth image pin' >&2; exit 1;
}
[ "$(/usr/bin/awk -F= '$1 == "AUTH_GATEWAY_IMAGE_DIGEST" {print $2}' "$release_env")" = "$old_image" ] || {
  echo 'Release manifest Auth pin differs from the expected old pin; refusing overwrite' >&2; exit 1;
}
test ! -e "$bom_backup" && test ! -e "$env_backup" || {
  echo 'A dated safety backup already exists; refusing to overwrite it' >&2; exit 1;
}

/bin/cp -p "$bom" "$bom_backup"
/bin/cp -p "$release_env" "$env_backup"
changed=0
rollback() {
  status=$?
  if [ "$status" -ne 0 ] && [ "$changed" -eq 1 ]; then
    trap - EXIT HUP INT TERM
    /bin/cp -p "$bom_backup" "$bom"
    /bin/cp -p "$env_backup" "$release_env"
    echo 'Auth pin update failed; original BOM and release manifest restored' >&2
  fi
  exit "$status"
}
trap rollback EXIT HUP INT TERM

tmp_bom="$bom.tmp.$$"
/usr/bin/install -m 644 "$source_bom" "$tmp_bom"
/bin/mv "$tmp_bom" "$bom"
changed=1

node --input-type=module - "$release_env" "$old_image" "$new_image" <<'NODE'
import { chmodSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const [file, oldImage, newImage] = process.argv.slice(2);
const source = readFileSync(file, 'utf8');
const rows = source.split(/\r?\n/).filter((line) => line.startsWith('AUTH_GATEWAY_IMAGE_DIGEST='));
if (rows.length !== 1 || rows[0] !== `AUTH_GATEWAY_IMAGE_DIGEST=${oldImage}`) {
  throw new Error('Release manifest changed during guarded Auth pin update');
}
const mode = statSync(file).mode & 0o777;
const temp = join(dirname(file), `.portals-release.env.auth-stage-${process.pid}`);
writeFileSync(temp, source.replace(/^AUTH_GATEWAY_IMAGE_DIGEST=.*$/m, `AUTH_GATEWAY_IMAGE_DIGEST=${newImage}`), { mode });
chmodSync(temp, mode);
renameSync(temp, file);
NODE

/usr/bin/grep -F -x "  image: \"$new_image\"" "$bom" >/dev/null
[ "$(/usr/bin/awk -F= '$1 == "AUTH_GATEWAY_IMAGE_DIGEST" {print $2}' "$release_env")" = "$new_image" ]
changed=0
trap - EXIT HUP INT TERM
echo 'AUTH_STAGE_PIN_UPDATE=complete old=7d1c6a candidate=96a4f5 backups=preserved'

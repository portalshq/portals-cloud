#!/bin/sh
set -eu
umask 077

# Deploy only the promoted Lore image. Keep Auth and Caddy untouched so the
# Lore client can be exercised against the currently running Auth behavior.
[ "$(id -un)" = portals-svc ] || { echo 'Run as portals-svc' >&2; exit 1; }
PATH=/Users/Shared/portals-tools/bin:/Users/Shared/portals-tools/node_modules/.bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
export PATH

readonly expected_bom_sha='c6566bb1e59a63764ebfe7584b15d704daafb455afd1b6a5383b4b5fe89a01b2'
readonly old_image='portalshq/lore@sha256:d204cee28f0966017f9622822b235e5630bdd6163ffbbc9d70c1bed2ff8fe4e4'
readonly new_image='portalshq/lore@sha256:be13e82521606050a5dcfaaef2a550af89994ae02d98907b7a7b7f95cff3d9bf'
readonly bom='/Users/portals-svc/portals/infra/lore/versions.yaml'
readonly root='/Users/portals-svc/portals/infra/mac-bootstrap'
readonly release_env='/Users/portals-svc/portals-release.env'
readonly backup="$release_env.pre-lore-deploy-20261017-composefix"
readonly compose_file="$root/templates/compose.prod.yaml"
readonly container='templates-lore-1'

fail() { echo "$1" >&2; exit 1; }
test -r "$bom" && test -r "$release_env" && test -r "$compose_file" || fail 'Lore deployment inputs are missing/unreadable'
actual_bom_sha=$(/usr/bin/shasum -a 256 "$bom" | /usr/bin/awk '{print $1}')
[ "$actual_bom_sha" = "$expected_bom_sha" ] || fail 'BOM checksum differs from the verified promoted release'
/usr/bin/grep -F -x "  image: \"$new_image\"" "$bom" >/dev/null || fail 'Promoted Lore digest is absent from BOM'
[ "$(/usr/bin/grep -c '^LORE_IMAGE_DIGEST=' "$release_env")" -eq 1 ] || fail 'Release manifest must contain exactly one Lore image pin'

rollback() {
  result=$?
  trap - EXIT HUP INT TERM
  if [ "$result" -ne 0 ] && [ -e "$backup" ]; then
    /bin/cp -p "$backup" "$release_env"
    # Compose prioritizes exported shell variables over --env-file.
    LORE_IMAGE_DIGEST=$old_image
    export LORE_IMAGE_DIGEST
    if /usr/local/bin/docker-compose --env-file "$release_env" -f "$compose_file" up -d --no-deps lore >/dev/null 2>&1; then
      rollback_ready=0
      for _ in $(/usr/bin/seq 1 30); do
        rollback_id=$(/usr/local/bin/docker inspect --format '{{.Image}}' "$container" 2>/dev/null || true)
        rollback_health=$(/usr/local/bin/docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)
        if [ "$rollback_id" = "$expected_old_id" ] && [ "$rollback_health" = healthy ] && \
           /usr/bin/curl --connect-timeout 2 --max-time 3 --fail --silent http://127.0.0.1:41339/health_check >/dev/null; then
          rollback_ready=1
          break
        fi
        sleep 2
      done
      [ "$rollback_ready" -eq 1 ] && echo 'LORE_ROLLBACK=PASS prior image healthy' >&2 || echo 'LORE_ROLLBACK=FAILED; immediate operator inspection required' >&2
    else
      echo 'LORE_ROLLBACK=FAILED; prior release manifest restored but Compose rollback command failed' >&2
    fi
  fi
  exit "$result"
}

current_image_id=$(/usr/local/bin/docker inspect --format '{{.Image}}' "$container" 2>/dev/null) || fail 'Current Lore production container is unavailable'
expected_old_id=$(/usr/local/bin/docker image inspect --format '{{.Id}}' "$old_image" 2>/dev/null) || fail 'Previous Lore rollback image is not cached'
[ "$current_image_id" = "$expected_old_id" ] || fail 'Running Lore image differs from expected rollback baseline; refusing deployment'
trap rollback EXIT HUP INT TERM

pin=$(/usr/bin/awk -F= '$1 == "LORE_IMAGE_DIGEST" {print $2}' "$release_env")
case "$pin" in
  "$old_image")
    test ! -e "$backup" || fail 'Dated release-manifest backup already exists; refusing overwrite'
    /bin/cp -p "$release_env" "$backup"
    node --input-type=module - "$release_env" "$old_image" "$new_image" <<'NODE'
import { chmodSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const [file, oldImage, newImage] = process.argv.slice(2);
const source = readFileSync(file, 'utf8');
const rows = source.split(/\r?\n/).filter((line) => line.startsWith('LORE_IMAGE_DIGEST='));
if (rows.length !== 1 || rows[0] !== `LORE_IMAGE_DIGEST=${oldImage}`) throw new Error('Lore pin changed during update');
const mode = statSync(file).mode & 0o777;
const temp = join(dirname(file), `.portals-release.env.lore-deploy-${process.pid}`);
writeFileSync(temp, source.replace(/^LORE_IMAGE_DIGEST=.*$/m, `LORE_IMAGE_DIGEST=${newImage}`), {mode});
chmodSync(temp, mode);
renameSync(temp, file);
NODE
    ;;
  "$new_image") test -e "$backup" || fail 'New pin is already set without this deployment backup; refusing deployment'; echo 'LORE_RELEASE_PIN_ALREADY_CURRENT' ;;
  *) fail 'Release manifest Lore pin differs from both expected old and promoted images; refusing deployment' ;;
esac

# Do not source the private release file into this shell. An exported stale
# pin would override the updated value supplied by Compose's --env-file.
LORE_IMAGE_DIGEST=$new_image
export LORE_IMAGE_DIGEST

export MAC_RELEASE_ENV="$release_env"
cd "$root"
/usr/local/bin/docker pull "$new_image" >/dev/null
new_image_id=$(/usr/local/bin/docker image inspect --format '{{.Id}}' "$new_image")
platform=$(/usr/local/bin/docker image inspect --format '{{.Os}}/{{.Architecture}}' "$new_image")
[ "$platform" = 'linux/amd64' ] || fail 'Promoted Lore image does not match the Mac host platform'
/usr/local/bin/docker-compose --env-file "$release_env" -f "$compose_file" config --quiet
/usr/local/bin/docker-compose --env-file "$release_env" -f "$compose_file" up -d --no-deps lore >/dev/null

ready=0
for _ in $(/usr/bin/seq 1 45); do
  running_id=$(/usr/local/bin/docker inspect --format '{{.Image}}' "$container" 2>/dev/null || true)
  health=$(/usr/local/bin/docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)
  if [ "$running_id" = "$new_image_id" ] && [ "$health" = healthy ] && \
     /usr/bin/curl --connect-timeout 2 --max-time 3 --fail --silent http://127.0.0.1:41339/health_check >/dev/null; then
    ready=1
    break
  fi
  sleep 2
done
[ "$ready" = 1 ] || fail 'Promoted Lore container did not become healthy on its pinned image'

trap - EXIT HUP INT TERM
echo 'LORE_DEPLOYMENT=PASS image=be13e8252160 platform=linux/amd64 auth_unchanged=true caddy_unchanged=true'

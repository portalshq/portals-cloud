#!/bin/sh
set -eu

source_dir=${BACKUP_SOURCE_DIR:?BACKUP_SOURCE_DIR is required}
destination=${BACKUP_DESTINATION:?BACKUP_DESTINATION is required}
key_file=${BACKUP_KEY_FILE:?BACKUP_KEY_FILE is required}
test -d "$source_dir" && test -r "$source_dir" || { echo 'backup source is unreadable' >&2; exit 1; }
test -f "$key_file" && test -r "$key_file" || { echo 'backup key file is unreadable' >&2; exit 1; }
mkdir -p "$(dirname "$destination")"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
mkdir "$tmp/recovery"
find "$source_dir" -maxdepth 1 -type f \( -name '*.json' -o -name '*.yaml' -o -name '*.yml' \) -exec cp -p {} "$tmp/recovery/" \;
test -n "$(find "$tmp/recovery" -type f -print -prune)" || { echo 'no recovery manifests found' >&2; exit 1; }

tar -C "$tmp" -czf - recovery \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass "file:$key_file" -out "$destination"
chmod 600 "$destination"
openssl dgst -sha256 -r "$destination" > "$destination.sha256"
chmod 600 "$destination.sha256"
printf '%s\n' "Encrypted recovery bundle written to $destination"

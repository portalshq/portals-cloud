#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
check=$ROOT/scripts/check-disk-space.sh

sh "$check" "$HOME" 1

if output=$(sh "$check" "$HOME" 999999999999 2>&1); then
  echo 'Disk-space check must reject a requirement larger than available disk' >&2
  exit 1
fi
case "$output" in *'At least 999999999999 KiB must be free'*) ;; *) echo "Unexpected low-space diagnostic: $output" >&2; exit 1 ;; esac

if output=$(sh "$check" /__portals_nonexistent_disk_volume__ 1 2>&1); then
  echo 'Disk-space check must fail closed when df cannot inspect its path' >&2
  exit 1
fi
case "$output" in *'Unable to determine free space on the runtime volume'*) ;; *) echo "Unexpected df-failure diagnostic: $output" >&2; exit 1 ;; esac

if sh "$check" "$HOME" not-a-number >/dev/null 2>&1; then
  echo 'Disk-space check must reject a malformed minimum' >&2
  exit 1
fi

printf '%s\n' 'Disk-space checks passed for adequate, insufficient, inaccessible, and malformed cases'

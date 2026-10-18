#!/bin/sh
set -eu

disk_path=${1:?Usage: check-disk-space.sh path minimum-kib}
minimum_kib=${2:?Usage: check-disk-space.sh path minimum-kib}
case "$minimum_kib" in
  ''|*[!0-9]*) echo 'Disk-space minimum must be an integer KiB value' >&2; exit 2 ;;
esac

# Use the service account's home volume, not the current working directory.
# On macOS, df can fail getattrlist on a nested checkout even when that account
# can cd into it; stderr is suppressed here so the fail-closed diagnostic below
# explains what the preflight could not determine.
if ! disk_usage=$(df -Pk "$disk_path" 2>/dev/null); then
  echo "Unable to determine free space on the runtime volume: $disk_path" >&2
  exit 1
fi
available_kib=$(printf '%s\n' "$disk_usage" | awk 'NR == 2 { print $4; exit }')
case "$available_kib" in
  ''|*[!0-9]*) echo "Unable to parse free space on the runtime volume: $disk_path" >&2; exit 1 ;;
esac
if [ "$available_kib" -lt "$minimum_kib" ]; then
  echo "At least $minimum_kib KiB must be free on the runtime volume (found $available_kib KiB)" >&2
  exit 1
fi

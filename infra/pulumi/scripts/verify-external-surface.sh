#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:?usage: verify-external-surface.sh HOST containment|release}"
MODE="${2:?usage: verify-external-surface.sh HOST containment|release}"

case "$MODE" in
  containment) expected_open="" ;;
  release) expected_open="443" ;;
  *) echo "mode must be containment or release" >&2; exit 2 ;;
esac

failed=0
for port in 443 8083 41337 41339; do
  if nc -z -w 5 "$TARGET" "$port" >/dev/null 2>&1; then
    observed="open"
  else
    observed="closed"
  fi
  if [[ "$port" == "$expected_open" ]]; then
    expected="open"
  else
    expected="closed"
  fi
  printf '%s:%s observed=%s expected=%s\n' "$TARGET" "$port" "$observed" "$expected"
  [[ "$observed" == "$expected" ]] || failed=1
done

if [[ "$MODE" == "release" ]]; then
  if ! printf '' | openssl s_client -connect "$TARGET:443" -servername "$TARGET" \
      -verify_hostname "$TARGET" -verify_return_error >/dev/null 2>&1; then
    echo "$TARGET:443 TLS hostname/chain verification failed" >&2
    failed=1
  fi
fi

exit "$failed"

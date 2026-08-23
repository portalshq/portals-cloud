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
  # macOS nc -w does not bound CONNECT time; a firewalled DROP would hang.
  # perl alarm gives a hard 6s ceiling per probe on every platform.
  if perl -e 'alarm 6; exec @ARGV' nc -z "$TARGET" "$port" >/dev/null 2>&1; then
    observed="open"
  else
    observed="closed"
  fi
  if [[ "$port" == "$expected_open" ]]; then expected="open"; else expected="closed"; fi
  printf '%s:%s observed=%s expected=%s\n' "$TARGET" "$port" "$observed" "$expected"
  [[ "$observed" == "$expected" ]] || failed=1
done

if [[ "$MODE" == "release" ]]; then
  # Cross-platform TLS verification with hard timeout: LibreSSL/OpenSSL
  # s_client can idle forever behind an ALB h2 keepalive, so wrap it in a
  # perl alarm (perl ships on macOS/Linux) and inspect the transcript.
  OUT="$(mktemp)"
  perl -e 'alarm 8; exec @ARGV' \
    openssl s_client -connect "$TARGET:443" -servername "$TARGET" \
    -verify_hostname "$TARGET" </dev/null >"$OUT" 2>&1 || true
  if ! grep -q "Verify return code: 0 (ok)" "$OUT"; then
    echo "$TARGET:443 TLS hostname/chain verification failed" >&2
    failed=1
  fi
  rm -f "$OUT"
fi

exit "$failed"

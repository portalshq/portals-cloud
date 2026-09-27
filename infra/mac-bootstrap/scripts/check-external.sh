#!/bin/sh
set -eu

: "${AUTH_DOMAIN:?AUTH_DOMAIN is required}"
: "${LORE_DOMAIN:?LORE_DOMAIN is required}"
: "${WORKER_URL:?WORKER_URL is required}"
: "${LORE_QUIC_HOST:?LORE_QUIC_HOST is required}"
: "${LORE_QUIC_PORT:?LORE_QUIC_PORT is required}"
: "${WAKE_SECRET:?WAKE_SECRET is required}"
: "${WAKE_ID:?WAKE_ID is required}"
: "${WAKE_TIMESTAMP:?WAKE_TIMESTAMP is required}"
: "${WAKE_BODY:?WAKE_BODY is required}"

command -v curl >/dev/null || { echo 'curl is required' >&2; exit 1; }
command -v grpcurl >/dev/null || { echo 'grpcurl is required' >&2; exit 1; }
command -v nc >/dev/null || { echo 'nc is required' >&2; exit 1; }
command -v openssl >/dev/null || { echo 'openssl is required' >&2; exit 1; }

check_cert() {
  host=$1
  openssl s_client -connect "${host}:443" -servername "$host" </dev/null 2>/dev/null \
    | openssl x509 -noout -checkhost "$host" >/dev/null 2>&1 || {
      echo "TLS certificate hostname check failed for $host" >&2
      exit 1
    }
}

curl --fail --silent --show-error "https://${AUTH_DOMAIN}/health" >/dev/null
if curl --fail --silent "${WORKER_URL}/health" >/dev/null 2>&1; then
  echo 'Worker health must not be publicly exposed' >&2
  exit 1
fi
grpcurl -vv -authority "${AUTH_DOMAIN}" "${AUTH_DOMAIN}:443" list >/dev/null
grpcurl -vv -authority "${LORE_DOMAIN}" "${LORE_DOMAIN}:443" list >/dev/null
nc -z -u -w 3 "${LORE_QUIC_HOST}" "${LORE_QUIC_PORT}"
check_cert "$AUTH_DOMAIN"
check_cert "$LORE_DOMAIN"

body_hash=$(printf '%s' "$WAKE_BODY" | openssl dgst -sha256 -hex | awk '{print $2}')
canonical=$(printf 'POST\n/internal/wake\n%s\n%s\n%s' "$WAKE_TIMESTAMP" "$WAKE_ID" "$body_hash")
signature=$(printf '%s' "$canonical" | openssl dgst -sha256 -mac HMAC -macopt "key:${WAKE_SECRET}" -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')
curl --fail --silent --show-error -X POST "${WORKER_URL}/internal/wake" \
  -H 'content-type: application/json' \
  -H "x-portals-timestamp: ${WAKE_TIMESTAMP}" \
  -H "x-portals-wake-id: ${WAKE_ID}" \
  -H "x-portals-signature: ${signature}" \
  --data "$WAKE_BODY" >/dev/null

printf '%s\n' 'External TLS, gRPC, health, and UDP probes passed.\n'

#!/bin/sh
set -eu

: "${AUTH_DOMAIN:?AUTH_DOMAIN is required}"
: "${LORE_DOMAIN:?LORE_DOMAIN is required}"
: "${LORE_QUIC_HOST:?LORE_QUIC_HOST is required}"
: "${LORE_QUIC_PORT:?LORE_QUIC_PORT is required}"
: "${AUTH_GRPC_PROBE_COMMAND:?AUTH_GRPC_PROBE_COMMAND is required}"
: "${LORE_GRPC_PROBE_COMMAND:?LORE_GRPC_PROBE_COMMAND is required}"
: "${LORE_QUIC_PROBE_COMMAND:?LORE_QUIC_PROBE_COMMAND is required}"
: "${TENANT_DENIAL_PROBE_COMMAND:?TENANT_DENIAL_PROBE_COMMAND is required}"

command -v curl >/dev/null || { echo 'curl is required' >&2; exit 1; }
command -v grpcurl >/dev/null || { echo 'grpcurl is required' >&2; exit 1; }
command -v nc >/dev/null || { echo 'nc is required' >&2; exit 1; }

check_tls_host() {
  host=$1
  # curl performs normal CA-chain and hostname verification. Do not use
  # openssl x509 -checkhost here: the system LibreSSL shipped with some macOS
  # releases does not implement that option.
  curl --silent --show-error --connect-timeout 10 --max-time 15 \
    --output /dev/null "https://${host}/" || {
      echo "TLS verification failed for ${host}" >&2
      exit 1
    }
}

curl --fail --silent --show-error --connect-timeout 10 --max-time 15 \
  "https://${AUTH_DOMAIN}/.well-known/jwks.json" >/dev/null || {
    echo "Auth JWKS/TLS check failed for ${AUTH_DOMAIN}" >&2
    exit 1
  }
check_tls_host "$LORE_DOMAIN"

# Service reflection and a UDP socket probe do not prove authenticated protocol access.
# Each pinned-client probe must run against the public endpoint and fail non-zero on denial.
sh -c "$AUTH_GRPC_PROBE_COMMAND"
sh -c "$LORE_GRPC_PROBE_COMMAND"
sh -c "$LORE_QUIC_PROBE_COMMAND"
sh -c "$TENANT_DENIAL_PROBE_COMMAND"

printf '%s\n' 'External TLS, authenticated gRPC, QUIC, and tenant-denial probes passed.'

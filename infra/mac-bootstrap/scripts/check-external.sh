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
command -v openssl >/dev/null || { echo 'openssl is required' >&2; exit 1; }

check_cert() {
  host=$1
  openssl s_client -connect "${host}:443" -servername "$host" </dev/null 2>/dev/null \
    | openssl x509 -noout -checkhost "$host" >/dev/null 2>&1 || {
      echo "TLS certificate hostname check failed for $host" >&2
      exit 1
    }
}

curl --fail --silent --show-error "https://${AUTH_DOMAIN}/.well-known/jwks.json" >/dev/null
check_cert "$AUTH_DOMAIN"
check_cert "$LORE_DOMAIN"

# Service reflection and a UDP socket probe do not prove authenticated protocol access.
# Each pinned-client probe must run against the public endpoint and fail non-zero on denial.
sh -c "$AUTH_GRPC_PROBE_COMMAND"
sh -c "$LORE_GRPC_PROBE_COMMAND"
sh -c "$LORE_QUIC_PROBE_COMMAND"
sh -c "$TENANT_DENIAL_PROBE_COMMAND"

printf '%s\n' 'External TLS, authenticated gRPC, QUIC, and tenant-denial probes passed.'

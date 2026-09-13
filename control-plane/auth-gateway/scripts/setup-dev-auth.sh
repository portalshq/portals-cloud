#!/usr/bin/env bash
set -euo pipefail
#
# Generate a private dev CA and a TLS cert for auth.dev.example.com.
# Lore strict mode trusts ONLY this CA via server.auth.jwk.ca_file —
# hostname validation stays on and TLS verification is never disabled.
#
# Usage:
#   ./scripts/setup-dev-auth.sh
#   # Then add to /etc/hosts:
#   #   127.0.0.1 auth.dev.example.com
#   # And configure Lore:
#   #   ca_file = "/Users/vibrantceo/Library/Application Support/Portals/Lore/auth/dev-root-ca.pem"
#

DOMAIN="auth.dev.example.com"
CERTS_DIR="$(cd "$(dirname "$0")/../dev-certs" && pwd 2>/dev/null || echo "$(dirname "$0")/../dev-certs")"
LORE_CA_DIR="$HOME/Library/Application Support/Portals/Lore/auth"
LORE_CA_FILE="$LORE_CA_DIR/dev-root-ca.pem"

mkdir -p "$CERTS_DIR" "$LORE_CA_DIR"

CA_KEY="$CERTS_DIR/rootCA.key"
CA_CRT="$CERTS_DIR/rootCA.pem"
CERT_KEY="$CERTS_DIR/$DOMAIN.key"
CERT_CSR="$CERTS_DIR/$DOMAIN.csr"
CERT_CRT="$CERTS_DIR/$DOMAIN.crt"
JWT_KEY="$CERTS_DIR/../dev-jwt.key"

echo "→ Generating private dev CA (if missing)..."
if [[ ! -f "$CA_KEY" ]]; then
  openssl genrsa -out "$CA_KEY" 4096
  chmod 600 "$CA_KEY"
fi
if [[ ! -f "$CA_CRT" ]]; then
  openssl req -x509 -new -nodes -key "$CA_KEY" -sha256 -days 825 \
    -out "$CA_CRT" -subj "/CN=Portals Dev Root CA/O=Portals Dev/C=US"
  chmod 644 "$CA_CRT"
fi

echo "→ Installing CA for Lore strict mode..."
cp "$CA_CRT" "$LORE_CA_FILE"
chmod 644 "$LORE_CA_FILE"
echo "  CA → $LORE_CA_FILE"

echo "→ Generating TLS cert for $DOMAIN..."
if [[ ! -f "$CERT_KEY" ]]; then
  openssl genrsa -out "$CERT_KEY" 2048
  chmod 600 "$CERT_KEY"
fi

cat > "$CERTS_DIR/openssl.cnf" <<EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no
[req_distinguished_name]
CN = $DOMAIN
[ v3_req ]
subjectAltName = @alt_names
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
[alt_names]
DNS.1 = $DOMAIN
EOF

openssl req -new -key "$CERT_KEY" -out "$CERT_CSR" -config "$CERTS_DIR/openssl.cnf"

cat > "$CERTS_DIR/v3.ext" <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names
[alt_names]
DNS.1 = $DOMAIN
EOF

openssl x509 -req -in "$CERT_CSR" -CA "$CA_CRT" -CAkey "$CA_KEY" -CAcreateserial \
  -out "$CERT_CRT" -days 825 -sha256 -extfile "$CERTS_DIR/v3.ext"

chmod 644 "$CERT_CRT"
rm -f "$CERTS_DIR/openssl.cnf" "$CERTS_DIR/v3.ext" "$CERTS_DIR/rootCA.srl"

echo "→ Generating dev JWT signing key (if missing)..."
if [[ ! -f "$JWT_KEY" ]]; then
  openssl genrsa -out "$JWT_KEY" 2048
  chmod 600 "$JWT_KEY"
  echo "  JWT key → $JWT_KEY"
else
  echo "  JWT key exists → $JWT_KEY"
fi

echo ""
echo "✓ Dev auth TLS ready."
echo "  Cert: $CERT_CRT"
echo "  Key : $CERT_KEY"
echo "  CA  : $CA_CRT (also at $LORE_CA_FILE)"
echo ""
echo "Next:"
echo "  1. Add to /etc/hosts:  127.0.0.1 $DOMAIN"
echo "  2. Configure Lore strict mode:"
echo "       [server.auth]"
echo "       jwt_issuer = \"https://$DOMAIN\""
echo "       jwt_audience = [\"lore\", \"portals.works\"]"
echo "       [server.auth.jwk]"
echo "       endpoint = \"https://$DOMAIN/.well-known/jwks.json\""
echo "       ca_file = \"$LORE_CA_FILE\""
echo "  3. docker compose -f docker-compose.dev.yml up -d"
echo "  4. LORE_ENV=dev LORE_SECURITY_MODE=strict lore-server --config lore-server/config"
echo ""
echo "For a publicly trusted cert, omit ca_file and serve JWKS from a real"
echo "hostname with a Let's Encrypt / ACM cert instead."


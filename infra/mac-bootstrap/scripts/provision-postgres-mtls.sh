#!/bin/sh
# Creates the database credentials and mTLS material; run once as Mac root.
set -eu

LC_ALL=C
LANG=C
export LC_ALL LANG

SERVICE_USER=portals-svc
SERVICE_GROUP=staff
SECRETS=/Users/portals-svc/secrets
POSTGRES_ENV=$SECRETS/postgres.env
POSTGRES_SECRET_DIR=$SECRETS/postgres
POSTGRES_TLS_DIR=$SECRETS/postgres-tls
POSTGRES_CA_DIR=$SECRETS/postgres-ca
POSTGRES_CLIENT_DIR=$SECRETS/postgres-client
AUTH_DB_TLS_DIR=$SECRETS/auth-db-tls
DB_HOST=${POSTGRES_HOSTNAME:-db.portals.works}

test "$(id -u)" -eq 0 || { echo 'Run as root via sudo.' >&2; exit 1; }
command -v openssl >/dev/null || { echo 'openssl is required.' >&2; exit 1; }
case "$DB_HOST" in *[!A-Za-z0-9.-]*|'') echo 'POSTGRES_HOSTNAME is invalid.' >&2; exit 1 ;; esac

umask 077
install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0700 "$POSTGRES_SECRET_DIR" "$POSTGRES_TLS_DIR" "$POSTGRES_CA_DIR" "$POSTGRES_CLIENT_DIR" "$AUTH_DB_TLS_DIR"

if [ ! -f "$POSTGRES_SECRET_DIR/password" ]; then
  openssl rand -base64 48 | tr -d '\n' >"$POSTGRES_SECRET_DIR/password"
  printf '\n' >>"$POSTGRES_SECRET_DIR/password"
fi
if [ ! -f "$POSTGRES_ENV" ]; then
  cat >"$POSTGRES_ENV" <<'EOF'
POSTGRES_DB=channels
POSTGRES_USER=channels_app
POSTGRES_PASSWORD_FILE=/run/secrets/postgres/password
POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256
EOF
fi

if [ ! -f "$POSTGRES_CA_DIR/ca.key" ]; then
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$POSTGRES_CA_DIR/ca.key"
  openssl req -x509 -new -sha256 -days 3650 -key "$POSTGRES_CA_DIR/ca.key" -out "$POSTGRES_CA_DIR/ca.crt" -subj '/CN=Portals Channels PostgreSQL CA'
fi

if [ ! -f "$POSTGRES_TLS_DIR/server.key" ]; then
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$POSTGRES_TLS_DIR/server.key"
  openssl req -new -key "$POSTGRES_TLS_DIR/server.key" -out "$POSTGRES_TLS_DIR/server.csr" -subj "/CN=$DB_HOST"
  cat >"$POSTGRES_TLS_DIR/server.ext" <<EOF
subjectAltName=DNS:$DB_HOST
extendedKeyUsage=serverAuth
keyUsage=critical,digitalSignature,keyEncipherment
EOF
  openssl x509 -req -sha256 -days 825 -in "$POSTGRES_TLS_DIR/server.csr" -CA "$POSTGRES_CA_DIR/ca.crt" -CAkey "$POSTGRES_CA_DIR/ca.key" -CAcreateserial -out "$POSTGRES_TLS_DIR/server.crt" -extfile "$POSTGRES_TLS_DIR/server.ext"
  rm -f "$POSTGRES_TLS_DIR/server.csr" "$POSTGRES_TLS_DIR/server.ext"
fi

if [ ! -f "$POSTGRES_CLIENT_DIR/channels_app.key" ]; then
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$POSTGRES_CLIENT_DIR/channels_app.key"
  openssl req -new -key "$POSTGRES_CLIENT_DIR/channels_app.key" -out "$POSTGRES_CLIENT_DIR/channels_app.csr" -subj '/CN=channels_app'
  cat >"$POSTGRES_CLIENT_DIR/client.ext" <<'EOF'
extendedKeyUsage=clientAuth
keyUsage=critical,digitalSignature,keyEncipherment
EOF
  openssl x509 -req -sha256 -days 825 -in "$POSTGRES_CLIENT_DIR/channels_app.csr" -CA "$POSTGRES_CA_DIR/ca.crt" -CAkey "$POSTGRES_CA_DIR/ca.key" -CAcreateserial -out "$POSTGRES_CLIENT_DIR/channels_app.crt" -extfile "$POSTGRES_CLIENT_DIR/client.ext"
  rm -f "$POSTGRES_CLIENT_DIR/channels_app.csr" "$POSTGRES_CLIENT_DIR/client.ext"
fi

if [ ! -f "$AUTH_DB_TLS_DIR/client.key" ]; then
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$AUTH_DB_TLS_DIR/client.key"
  openssl req -new -key "$AUTH_DB_TLS_DIR/client.key" -out "$AUTH_DB_TLS_DIR/client.csr" -subj '/CN=auth_gateway'
  cat >"$AUTH_DB_TLS_DIR/client.ext" <<'EOF'
extendedKeyUsage=clientAuth
keyUsage=critical,digitalSignature,keyEncipherment
EOF
  openssl x509 -req -sha256 -days 825 -in "$AUTH_DB_TLS_DIR/client.csr" -CA "$POSTGRES_CA_DIR/ca.crt" -CAkey "$POSTGRES_CA_DIR/ca.key" -CAcreateserial -out "$AUTH_DB_TLS_DIR/client.crt" -extfile "$AUTH_DB_TLS_DIR/client.ext"
  rm -f "$AUTH_DB_TLS_DIR/client.csr" "$AUTH_DB_TLS_DIR/client.ext"
fi

cp "$POSTGRES_CA_DIR/ca.crt" "$POSTGRES_TLS_DIR/ca.crt"
cp "$POSTGRES_CA_DIR/ca.crt" "$POSTGRES_CLIENT_DIR/ca.crt"
cp "$POSTGRES_CA_DIR/ca.crt" "$AUTH_DB_TLS_DIR/ca.crt"
cat >"$POSTGRES_TLS_DIR/pg_hba.conf" <<'EOF'
# Only this local container administrator and the named service roles may connect.
local all channels_app trust
local all all reject
hostssl channels channels_app 0.0.0.0/0 scram-sha-256 clientcert=verify-full
hostssl auth_gateway auth_gateway 0.0.0.0/0 scram-sha-256 clientcert=verify-full
host all all 0.0.0.0/0 reject
EOF

chown -R "$SERVICE_USER:$SERVICE_GROUP" "$POSTGRES_SECRET_DIR" "$POSTGRES_TLS_DIR" "$POSTGRES_CA_DIR" "$POSTGRES_CLIENT_DIR" "$AUTH_DB_TLS_DIR" "$POSTGRES_ENV"
chmod 0600 "$POSTGRES_SECRET_DIR/password" "$POSTGRES_ENV" "$POSTGRES_TLS_DIR/server.key" "$POSTGRES_CA_DIR/ca.key" "$POSTGRES_CLIENT_DIR/channels_app.key" "$AUTH_DB_TLS_DIR/client.key"
chmod 0644 "$POSTGRES_TLS_DIR/ca.crt" "$POSTGRES_TLS_DIR/server.crt" "$POSTGRES_TLS_DIR/pg_hba.conf" "$POSTGRES_CA_DIR/ca.crt" "$POSTGRES_CLIENT_DIR/ca.crt" "$POSTGRES_CLIENT_DIR/channels_app.crt" "$AUTH_DB_TLS_DIR/ca.crt" "$AUTH_DB_TLS_DIR/client.crt"

# Docker Desktop runs as andresb and needs a narrow read ACL for these mounts.
for path in "$SECRETS" "$POSTGRES_SECRET_DIR" "$POSTGRES_TLS_DIR" "$AUTH_DB_TLS_DIR"; do
  ls -lde "$path" | grep -Fq 'user:andresb' || chmod +a 'andresb allow read,readattr,readextattr,list,search' "$path"
done
for path in "$POSTGRES_SECRET_DIR/password" "$POSTGRES_TLS_DIR/ca.crt" "$POSTGRES_TLS_DIR/server.crt" "$POSTGRES_TLS_DIR/server.key" "$POSTGRES_TLS_DIR/pg_hba.conf"; do
  ls -le "$path" | grep -Fq 'user:andresb' || chmod +a 'andresb allow read,readattr,readextattr' "$path"
done
for path in "$AUTH_DB_TLS_DIR/ca.crt" "$AUTH_DB_TLS_DIR/client.crt" "$AUTH_DB_TLS_DIR/client.key"; do
  ls -le "$path" | grep -Fq 'user:andresb' || chmod +a 'andresb allow read,readattr,readextattr' "$path"
done

echo "POSTGRES_MTLS_READY host=$DB_HOST client_material=$POSTGRES_CLIENT_DIR"

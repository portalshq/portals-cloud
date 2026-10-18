#!/bin/sh
set -eu

umask 077

test "$(id -un)" = portals-svc || { echo 'Run certificate issuance as portals-svc' >&2; exit 1; }
: "${ACME_CONTACT_EMAIL:?Set the ACME account contact email}"
: "${CF_DNS_API_TOKEN_FILE:?Set the path to the Cloudflare DNS token file}"
case "$ACME_CONTACT_EMAIL" in *@*.*) ;; *) echo 'ACME_CONTACT_EMAIL must be an email address' >&2; exit 1 ;; esac

test -r "$CF_DNS_API_TOKEN_FILE" || { echo 'Cloudflare token file is unreadable' >&2; exit 1; }
test "$(stat -f '%Su' "$CF_DNS_API_TOKEN_FILE")" = portals-svc || { echo 'Cloudflare token file must be owned by portals-svc' >&2; exit 1; }
case "$(stat -f '%Lp' "$CF_DNS_API_TOKEN_FILE")" in
  400|600) ;;
  *) echo 'Cloudflare token file must have mode 400 or 600' >&2; exit 1 ;;
esac
export CF_DNS_API_TOKEN_FILE

acme_state_dir=${ACME_STATE_DIR:-/Users/portals-svc/secrets/acme}
caddy_cert_dir=${CADDY_CERT_DIR:-/Users/portals-svc/secrets/caddy-certs}
for cert_path in "$acme_state_dir" "$caddy_cert_dir"; do
  case "$cert_path" in
    /Users/portals-svc/*) ;;
    *) echo 'Certificate storage must stay under /Users/portals-svc' >&2; exit 1 ;;
  esac
  mkdir -p "$cert_path"
  chmod 700 "$cert_path"
done

lego_bin=/Users/Shared/portals-tools/bin/lego
test -x "$lego_bin" || { echo 'Pinned lego client is missing' >&2; exit 1; }
"$lego_bin" run \
  --accept-tos \
  --server letsencrypt \
  --email "$ACME_CONTACT_EMAIL" \
  --dns cloudflare \
  --domains '*.portals.works' \
  --cert.name portals-wildcard \
  --path "$acme_state_dir"

cert_file=$acme_state_dir/certificates/portals-wildcard.crt
key_file=$acme_state_dir/certificates/portals-wildcard.key
test -s "$cert_file" && test -s "$key_file" || { echo 'ACME client did not produce the expected certificate and key' >&2; exit 1; }
for cert_host in auth.portals.works lore.portals.works staging-auth.portals.works staging-lore.portals.works; do
  openssl x509 -in "$cert_file" -noout -checkhost "$cert_host" >/dev/null || { echo "Certificate does not cover $cert_host" >&2; exit 1; }
done
openssl x509 -in "$cert_file" -noout -checkend 2592000 >/dev/null || { echo 'Certificate expires within 30 days' >&2; exit 1; }
cert_public_key=$(openssl x509 -in "$cert_file" -pubkey -noout | openssl pkey -pubin -outform DER | shasum -a 256)
private_public_key=$(openssl pkey -in "$key_file" -pubout -outform DER | shasum -a 256)
test "$cert_public_key" = "$private_public_key" || { echo 'Certificate and private key do not match' >&2; exit 1; }

if test -f "$caddy_cert_dir/fullchain.pem" && test -f "$caddy_cert_dir/privkey.pem" \
  && cmp -s "$cert_file" "$caddy_cert_dir/fullchain.pem" \
  && cmp -s "$key_file" "$caddy_cert_dir/privkey.pem"; then
  printf '%s\n' 'The installed Caddy certificate is current; no files changed.'
  exit 0
fi

# Keep the previous pair recoverable until the new Caddy and Lore probes pass.
if test -f "$caddy_cert_dir/fullchain.pem" || test -f "$caddy_cert_dir/privkey.pem"; then
  test -f "$caddy_cert_dir/fullchain.pem" && test -f "$caddy_cert_dir/privkey.pem" || { echo 'Existing Caddy certificate pair is incomplete' >&2; exit 1; }
  backup_dir=$acme_state_dir/previous-$(date -u +%Y%m%dT%H%M%SZ)
  mkdir -m 700 "$backup_dir"
  cp -p "$caddy_cert_dir/fullchain.pem" "$caddy_cert_dir/privkey.pem" "$backup_dir/"
fi
install -m 400 "$cert_file" "$caddy_cert_dir/fullchain.pem"
install -m 400 "$key_file" "$caddy_cert_dir/privkey.pem"

printf '%s\n' 'Issued and installed the *.portals.works certificate for Caddy.'
printf '%s\n' 'Verify local TLS after Caddy starts; do not move DNS or reuse this key for QUIC until its public hostname is established.'

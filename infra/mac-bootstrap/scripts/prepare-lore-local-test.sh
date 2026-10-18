#!/bin/sh
set -eu
umask 077
test "$(id -un)" = portals-svc || { echo 'Run as portals-svc' >&2; exit 1; }
PATH=/Users/Shared/portals-tools/node_modules/.bin:/Users/Shared/portals-tools/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
export PATH
release_env=/Users/portals-svc/portals-release.env
runtime=/Users/portals-svc/portals/infra/mac-bootstrap
set -a
. "$release_env"
set +a
# This local test uses the established production hostname as the TLS identity.
# Public UDP reachability/hostname verification remains a separate release gate.
test "${LORE_DOMAIN:-}" = lore.portals.works || { echo 'Expected established Lore hostname lore.portals.works' >&2; exit 1; }
test "${LORE_QUIC_CERT_DIR:-}" = /Users/portals-svc/secrets/lore-quic-certs || { echo 'Unexpected Lore certificate destination' >&2; exit 1; }
node --input-type=module -e '
import {readFileSync} from "node:fs";
import {X509Certificate,createPrivateKey,createPublicKey} from "node:crypto";
const cert=new X509Certificate(readFileSync(process.env.CADDY_CERT_DIR+"/fullchain.pem"));
if(!cert.checkHost(process.env.LORE_DOMAIN)||Date.parse(cert.validTo)<=Date.now()||Date.parse(cert.validFrom)>Date.now()) throw Error("Existing certificate does not cover the local Lore TLS identity or is not valid now");
const key=createPrivateKey(readFileSync(process.env.CADDY_CERT_DIR+"/privkey.pem"));
if(!cert.publicKey.export({type:"spki",format:"der"}).equals(createPublicKey(key).export({type:"spki",format:"der"}))) throw Error("Certificate/key mismatch");
console.log("LORE_LOCAL_CERTIFICATE_VALID");
'
if ! test -e "$LORE_QUIC_CERT_DIR"; then
  mkdir -m 700 "$LORE_QUIC_CERT_DIR"
  cp "$CADDY_CERT_DIR/fullchain.pem" "$LORE_QUIC_CERT_DIR/fullchain.pem"
  cp "$CADDY_CERT_DIR/privkey.pem" "$LORE_QUIC_CERT_DIR/privkey.pem"
  chmod 400 "$LORE_QUIC_CERT_DIR/fullchain.pem" "$LORE_QUIC_CERT_DIR/privkey.pem"
else
  # Preserve configured material; stop on partial or different certificates.
  cmp -s "$CADDY_CERT_DIR/fullchain.pem" "$LORE_QUIC_CERT_DIR/fullchain.pem"
  cmp -s "$CADDY_CERT_DIR/privkey.pem" "$LORE_QUIC_CERT_DIR/privkey.pem"
fi
MAC_RELEASE_ENV=$release_env /bin/sh /Users/Shared/portals-grant-docker-acls-20261014.sh
cd "$runtime"
node /Users/Shared/portals-check-release-20261014.mjs
docker run --rm --pull=missing --network none --read-only \
  --user 65532:65532 --entrypoint /bin/sh \
  --mount "type=bind,source=$LORE_QUIC_CERT_DIR,target=/run/secrets/lore-quic,readonly" \
  "$CADDY_IMAGE_DIGEST" \
  -ec 'test -r /run/secrets/lore-quic/fullchain.pem && test -r /run/secrets/lore-quic/privkey.pem'
curl --connect-timeout 3 --max-time 10 --fail --silent --show-error \
  --resolve "${AUTH_DOMAIN}:8443:127.0.0.1" \
  "https://${AUTH_DOMAIN}:8443/.well-known/jwks.json" >/dev/null
/usr/local/bin/docker-compose --env-file "$release_env" -f templates/compose.prod.yaml config --quiet
/usr/local/bin/docker-compose --env-file "$release_env" -f templates/compose.prod.yaml up -d lore
attempt=0
while test "$attempt" -lt 30; do
  if curl --connect-timeout 2 --max-time 3 --fail --silent http://127.0.0.1:41339/health_check >/dev/null; then
    echo LORE_LOCAL_READY
    exit 0
  fi
  attempt=$((attempt+1))
  sleep 2
done
echo 'LORE_NOT_READY: inspect service logs locally with credentials redacted' >&2
exit 1

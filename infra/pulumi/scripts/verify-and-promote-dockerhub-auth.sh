#!/usr/bin/env bash
# Only run after the trusted release workflow signs its clean build.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
IMAGE=${1:?immutable Auth Docker Hub image is required}
: "${SOURCE_COMMIT:?SOURCE_COMMIT is required}"
: "${PROTOCOL_COMMIT:?PROTOCOL_COMMIT is required}"
: "${COSIGN_CERTIFICATE_IDENTITY:?COSIGN_CERTIFICATE_IDENTITY is required}"
[[ "$IMAGE" =~ ^portalshq/auth-gateway@sha256:[a-f0-9]{64}$ ]] || exit 2
[[ "$SOURCE_COMMIT" =~ ^[a-f0-9]{40}$ && "$PROTOCOL_COMMIT" =~ ^[a-f0-9]{40}$ ]] || exit 2
[[ "$COSIGN_CERTIFICATE_IDENTITY" == https://github.com/portalshq/portals-cloud/.github/workflows/auth-dockerhub-release.yml@refs/* ]] || exit 2
test "$(git -C "$ROOT" rev-parse HEAD)" = "$SOURCE_COMMIT"
test "$(git -C "$ROOT/infra/lore/lore" rev-parse HEAD)" = "$PROTOCOL_COMMIT"
test -z "$(git -C "$ROOT" status --porcelain -- control-plane docker/auth-gateway .dockerignore)"
test -z "$(git -C "$ROOT/infra/lore/lore" status --porcelain -- lore-proto/proto)"

manifest=$(docker buildx imagetools inspect --raw "$IMAGE")
for arch in amd64 arm64; do
  jq -e --arg arch "$arch" '.manifests[] | select(.platform.os == "linux" and .platform.architecture == $arch)' <<< "$manifest" >/dev/null
done
PLATFORM_DIGEST=$(jq -er '.manifests[] | select(.platform.os == "linux" and .platform.architecture == "amd64") | .digest' <<< "$manifest")
for attestation in SBOM Provenance; do
  docker buildx imagetools inspect --format "{{json .$attestation}}" "$IMAGE" | jq -e 'type == "object" and length > 0' >/dev/null
done
cosign verify --certificate-identity "$COSIGN_CERTIFICATE_IDENTITY" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com "$IMAGE" >/dev/null
docker pull --platform linux/amd64 "$IMAGE" >/dev/null
docker image inspect "$IMAGE" | jq -e --arg source "$SOURCE_COMMIT" --arg protocol "$PROTOCOL_COMMIT" \
  '.[0].Config.Labels | .["org.opencontainers.image.revision"] == $source and .["io.portals.protocol-revision"] == $protocol' >/dev/null
# Match the existing Lore gate; scanner version is captured in the receipt.
TRIVY_IMAGE=${TRIVY_IMAGE:-aquasec/trivy:latest}
for arch in amd64 arm64; do
  docker run --rm "$TRIVY_IMAGE" image --platform "linux/$arch" --scanners vuln \
    --severity CRITICAL,HIGH --exit-code 1 --no-progress "$IMAGE"
done
TRIVY_VERSION=$(docker run --rm "$TRIVY_IMAGE" --version | awk 'NR==1 {print $2}')
export IMAGE SOURCE_COMMIT PROTOCOL_COMMIT PLATFORM_DIGEST TRIVY_VERSION COSIGN_CERTIFICATE_IDENTITY
cd "$ROOT"
node --input-type=module <<'JS'
import {atomicWriteJson, atomicWriteYaml, readJsonObject, readYamlDocument} from './infra/pulumi/scripts/version-file-utils.mjs';
const {IMAGE, SOURCE_COMMIT, PROTOCOL_COMMIT, PLATFORM_DIGEST, TRIVY_VERSION, COSIGN_CERTIFICATE_IDENTITY} = process.env;
const receiptFile = 'infra/lore/verified-dockerhub-images.json';
const versionsFile = 'infra/lore/versions.yaml';
const ledger = readJsonObject(receiptFile);
if (ledger.schemaVersion !== 1 || !ledger.receipts || typeof ledger.receipts !== 'object' || Array.isArray(ledger.receipts)) throw new Error('invalid receipt ledger');
const versions = readYamlDocument(versionsFile);
const verifiedAt = new Date().toISOString();
ledger.receipts[IMAGE] = {
  service: 'auth-gateway', platform: 'linux/amd64', verifiedPlatforms: ['linux/amd64', 'linux/arm64'],
  indexDigest: IMAGE.split('@')[1], platformDigest: PLATFORM_DIGEST,
  sourceCommit: SOURCE_COMMIT, protocolCommit: PROTOCOL_COMMIT,
  signature: {identity: COSIGN_CERTIFICATE_IDENTITY, issuer: 'https://token.actions.githubusercontent.com', verifiedFromRegistry: true},
  sbomReference: `${IMAGE}#sbom`, provenanceReference: `${IMAGE}#provenance`,
  trivyScan: {critical: 0, high: 0, scannerVersion: TRIVY_VERSION, completedAt: verifiedAt}, verifiedAt,
};
for (const [name, value] of Object.entries({source_repository: 'https://github.com/portalshq/portals-cloud.git', image: IMAGE, source_commit: SOURCE_COMMIT, protocol_commit: PROTOCOL_COMMIT, platform: 'linux/amd64', receipt_key: IMAGE})) versions.setIn(['control-plane', name], value);
atomicWriteJson(receiptFile, ledger);
atomicWriteYaml(versionsFile, versions);
console.log(`Verified Auth promotion prepared: ${IMAGE}`);
JS

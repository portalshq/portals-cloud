#!/usr/bin/env bash
# Download a Nap release, verify its GitHub-OIDC Sigstore bundles and every
# artifact checksum, then update versions.yaml. This never approves the whole
# platform release; E2E/security gates do that separately.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAG="${1:?usage: verify-and-promote-nap-release.sh <vX.Y.Z>}"
REPOSITORY="${NAP_GITHUB_REPOSITORY:-portalshq/narrativeengine}"
[[ "${TAG}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$ ]] || { echo "invalid Nap release tag" >&2; exit 2; }
command -v gh >/dev/null || { echo "gh is required" >&2; exit 2; }
command -v cosign >/dev/null || { echo "cosign is required" >&2; exit 2; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 2; }
command -v curl >/dev/null || { echo "curl is required" >&2; exit 2; }

sha256_file() {
  if command -v sha256sum >/dev/null; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
gh release download "${TAG}" --repo "${REPOSITORY}" --dir "${WORK}"

IDENTITY="https://github.com/${REPOSITORY}/.github/workflows/cli-release.yml@refs/tags/${TAG}"
ISSUER="https://token.actions.githubusercontent.com"
cosign verify-blob --bundle "${WORK}/SHA256SUMS.sigstore.json" \
  --certificate-identity "${IDENTITY}" --certificate-oidc-issuer "${ISSUER}" \
  "${WORK}/SHA256SUMS" >/dev/null
cosign verify-blob --bundle "${WORK}/release-metadata.sigstore.json" \
  --certificate-identity "${IDENTITY}" --certificate-oidc-issuer "${ISSUER}" \
  "${WORK}/release-metadata.json" >/dev/null

if command -v sha256sum >/dev/null; then
  (cd "${WORK}" && sha256sum -c SHA256SUMS)
else
  (cd "${WORK}" && shasum -a 256 -c SHA256SUMS)
fi

EXPECTED_MANIFEST="sha256:$(sha256_file "${WORK}/SHA256SUMS")"
[[ "$(jq -r '.artifact_manifest_sha256' "${WORK}/release-metadata.json")" == "${EXPECTED_MANIFEST}" ]] \
  || { echo "Nap metadata does not bind SHA256SUMS" >&2; exit 1; }
[[ "$(jq -r '.release_tag' "${WORK}/release-metadata.json")" == "${TAG}" ]] \
  || { echo "Nap metadata tag mismatch" >&2; exit 1; }

LORE_MANIFEST_URL="$(jq -r '.lore_client_artifact_manifest_url' "${WORK}/release-metadata.json")"
LORE_BUNDLE_URL="$(jq -r '.lore_client_signature_bundle_url' "${WORK}/release-metadata.json")"
LORE_VERSION="$(jq -r '.lore_client_version' "${WORK}/release-metadata.json")"
LORE_RELEASE_BASE="https://github.com/portalshq/lore/releases/download/v${LORE_VERSION}"
[[ "${LORE_MANIFEST_URL}" == "${LORE_RELEASE_BASE}/SHA256SUMS" ]] \
  || { echo "untrusted Lore artifact manifest URL" >&2; exit 1; }
[[ "${LORE_BUNDLE_URL}" == "${LORE_RELEASE_BASE}/SHA256SUMS.sigstore.json" ]] \
  || { echo "untrusted Lore signature bundle URL" >&2; exit 1; }
curl -fsSL -o "${WORK}/lore-SHA256SUMS" "${LORE_MANIFEST_URL}"
curl -fsSL -o "${WORK}/lore-SHA256SUMS.sigstore.json" "${LORE_BUNDLE_URL}"
LORE_EXPECTED_MANIFEST="$(jq -r '.lore_client_artifact_manifest_sha256' "${WORK}/release-metadata.json")"
LORE_ACTUAL_MANIFEST="sha256:$(sha256_file "${WORK}/lore-SHA256SUMS")"
[[ "${LORE_ACTUAL_MANIFEST}" == "${LORE_EXPECTED_MANIFEST}" ]] \
  || { echo "Lore artifact manifest digest mismatch" >&2; exit 1; }
LORE_IDENTITY="https://github.com/portalshq/lore/.github/workflows/release.yml@refs/tags/v${LORE_VERSION}"
cosign verify-blob --bundle "${WORK}/lore-SHA256SUMS.sigstore.json" \
  --certificate-identity "${LORE_IDENTITY}" --certificate-oidc-issuer "${ISSUER}" \
  "${WORK}/lore-SHA256SUMS" >/dev/null
LORE_SOURCE_COMMIT="$(gh api "repos/portalshq/lore/commits/v${LORE_VERSION}" --jq .sha)"
[[ "${LORE_SOURCE_COMMIT}" =~ ^[a-f0-9]{40}$ ]] \
  || { echo "Lore release tag did not resolve to a full source commit" >&2; exit 1; }

BASE_URL="https://github.com/${REPOSITORY}/releases/download/${TAG}"
node "${SCRIPT_DIR}/record-nap-release.mjs" \
  "${WORK}/release-metadata.json" "${BASE_URL}" "${LORE_SOURCE_COMMIT}"

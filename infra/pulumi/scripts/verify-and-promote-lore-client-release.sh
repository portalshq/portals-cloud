#!/usr/bin/env bash
# Verify the signed portalshq/lore CLI release and record it independently of
# Nap. This script never changes the Lore submodule gitlink or release.status.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAG="${1:?usage: verify-and-promote-lore-client-release.sh <vX.Y.Z>}"
REPOSITORY="${LORE_GITHUB_REPOSITORY:-portalshq/lore}"
[[ "${TAG}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$ ]] \
  || { echo "invalid Lore release tag" >&2; exit 2; }
for command in gh cosign jq curl node; do
  command -v "${command}" >/dev/null || { echo "${command} is required" >&2; exit 2; }
done

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

IDENTITY="https://github.com/${REPOSITORY}/.github/workflows/release.yml@refs/tags/${TAG}"
ISSUER="https://token.actions.githubusercontent.com"
cosign verify-blob --bundle "${WORK}/SHA256SUMS.sigstore.json" \
  --certificate-identity "${IDENTITY}" --certificate-oidc-issuer "${ISSUER}" \
  "${WORK}/SHA256SUMS" >/dev/null

if command -v sha256sum >/dev/null; then
  (cd "${WORK}" && sha256sum -c SHA256SUMS)
else
  (cd "${WORK}" && shasum -a 256 -c SHA256SUMS)
fi

[[ -f "${WORK}/install.sh" ]] || { echo "Lore release must include install.sh" >&2; exit 1; }
SOURCE_COMMIT="$(gh api "repos/${REPOSITORY}/commits/${TAG}" --jq .sha)"
[[ "${SOURCE_COMMIT}" =~ ^[a-f0-9]{40}$ ]] \
  || { echo "Lore release tag did not resolve to a full source commit" >&2; exit 1; }
MANIFEST_SHA256="sha256:$(sha256_file "${WORK}/SHA256SUMS")"
INSTALLER_SHA256="$(sha256_file "${WORK}/install.sh")"
RELEASE_BASE_URL="https://github.com/${REPOSITORY}/releases/download/${TAG}"

node "${SCRIPT_DIR}/record-lore-client-release.mjs" \
  "${TAG}" "${SOURCE_COMMIT}" "${INSTALLER_SHA256}" \
  "${RELEASE_BASE_URL}" "${MANIFEST_SHA256}"

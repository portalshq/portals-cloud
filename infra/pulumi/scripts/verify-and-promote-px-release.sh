#!/usr/bin/env bash
# Verify PX's GitHub-OIDC signatures, checksums, metadata, and Lore pin. Local
# mode gates publication; default mode downloads the release and records its
# verified BOM evidence. Runtime acceptance remains a separate release gate.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAG="${1:?usage: verify-and-promote-px-release.sh <vX.Y.Z> [--artifacts-dir DIR] [--verify-only]}"
shift
REPOSITORY="${PX_GITHUB_REPOSITORY:-portalshq/px}"
[[ "${TAG}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$ ]] || { echo "invalid Px release tag" >&2; exit 2; }
ARTIFACTS_DIR=""
VERIFY_ONLY=false
while (($#)); do
  case "$1" in
    --artifacts-dir)
      (($# >= 2)) || { echo "--artifacts-dir requires a path" >&2; exit 2; }
      ARTIFACTS_DIR="$2"
      shift 2
      ;;
    --verify-only)
      VERIFY_ONLY=true
      shift
      ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
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
if [[ "${VERIFY_ONLY}" == true && -z "${ARTIFACTS_DIR}" ]]; then
  echo "--verify-only requires --artifacts-dir" >&2
  exit 2
fi
if [[ -n "${ARTIFACTS_DIR}" ]]; then
  [[ -d "${ARTIFACTS_DIR}" ]] || { echo "artifact directory does not exist" >&2; exit 2; }
  cp -R "${ARTIFACTS_DIR}/." "${WORK}/"
else
  gh release download "${TAG}" --repo "${REPOSITORY}" --dir "${WORK}"
fi

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
  || { echo "Px metadata does not bind SHA256SUMS" >&2; exit 1; }
[[ "$(jq -r '.release_tag' "${WORK}/release-metadata.json")" == "${TAG}" ]] \
  || { echo "Px metadata tag mismatch" >&2; exit 1; }
PX_SOURCE_COMMIT="$(gh api "repos/${REPOSITORY}/commits/${TAG}" --jq .sha)"
[[ "${PX_SOURCE_COMMIT}" =~ ^[a-f0-9]{40}$ ]] \
  || { echo "Px release tag did not resolve to a full source commit" >&2; exit 1; }
[[ "$(jq -r '.source_commit' "${WORK}/release-metadata.json")" == "${PX_SOURCE_COMMIT}" ]] \
  || { echo "Px release metadata source commit does not match its tag" >&2; exit 1; }

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

if [[ "${VERIFY_ONLY}" == true ]]; then
  echo "PX_RELEASE_ARTIFACT_VERIFICATION=PASS tag=${TAG} source_commit=${PX_SOURCE_COMMIT} lore_version=${LORE_VERSION}"
  exit 0
fi

BASE_URL="https://github.com/${REPOSITORY}/releases/download/${TAG}"
node "${SCRIPT_DIR}/record-px-release.mjs" \
  "${WORK}/release-metadata.json" "${BASE_URL}" "${LORE_SOURCE_COMMIT}"

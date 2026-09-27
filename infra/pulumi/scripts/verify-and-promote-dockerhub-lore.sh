#!/usr/bin/env bash
# Verify a Docker Hub Lore digest and atomically record its Mac deployment pin.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
IMAGE="${1:?usage: verify-and-promote-dockerhub-lore.sh <portalshq/lore@sha256:...>}"
BASE_IMAGE="${BASE_IMAGE:?BASE_IMAGE is required}"
SOURCE_COMMIT="${SOURCE_COMMIT:?SOURCE_COMMIT is required}"
PACKAGING_COMMIT="${PACKAGING_COMMIT:?PACKAGING_COMMIT is required}"
BUILD_ID="${BUILD_ID:?BUILD_ID is required}"
LORE_VERSION="${LORE_VERSION:?LORE_VERSION is required}"
COSIGN_CERTIFICATE_IDENTITY="${COSIGN_CERTIFICATE_IDENTITY:?COSIGN_CERTIFICATE_IDENTITY is required}"
COSIGN_BUNDLE="${COSIGN_BUNDLE:?COSIGN_BUNDLE is required}"

[[ "${IMAGE}" =~ ^portalshq/lore@sha256:[a-f0-9]{64}$ && "${BASE_IMAGE}" =~ ^portalshq/lore@sha256:[a-f0-9]{64}$ ]] || { echo "images must be portalshq/lore immutable digests" >&2; exit 2; }
[[ "${SOURCE_COMMIT}" =~ ^[a-f0-9]{40}$ && "${PACKAGING_COMMIT}" =~ ^[a-f0-9]{40}$ ]] || { echo "source and packaging commits must be full hashes" >&2; exit 2; }
[[ "${LORE_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+-portals\.[1-9][0-9]*$ && "${BUILD_ID}" =~ ^[A-Za-z0-9._-]{1,64}$ ]] || { echo "invalid Lore version or build ID" >&2; exit 2; }
command -v docker >/dev/null || { echo "docker is required" >&2; exit 2; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 2; }
command -v cosign >/dev/null || { echo "cosign is required" >&2; exit 2; }

MANIFEST="$(docker buildx imagetools inspect --raw "${IMAGE}")"
PLATFORM_DIGEST="$(jq -r '.manifests[]? | select(.platform.os == "linux" and .platform.architecture == "amd64") | .digest' <<<"${MANIFEST}" | head -n 1)"
[[ "${PLATFORM_DIGEST}" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo "image lacks a linux/amd64 manifest" >&2; exit 1; }
SBOM="$(docker buildx imagetools inspect --format '{{json .SBOM}}' "${IMAGE}")"
PROVENANCE="$(docker buildx imagetools inspect --format '{{json .Provenance}}' "${IMAGE}")"
[[ -n "${SBOM}" && "${SBOM}" != "null" && "${SBOM}" != "{}" ]] || { echo "SBOM attestation cannot be decoded" >&2; exit 1; }
[[ -n "${PROVENANCE}" && "${PROVENANCE}" != "null" && "${PROVENANCE}" != "{}" ]] || { echo "provenance attestation cannot be decoded" >&2; exit 1; }
jq -e --arg commit "${SOURCE_COMMIT}" '.. | strings | select(. == $commit)' >/dev/null <<<"${PROVENANCE}" || { echo "provenance does not bind source commit" >&2; exit 1; }
jq -e --arg commit "${PACKAGING_COMMIT}" '.. | strings | select(. == $commit)' >/dev/null <<<"${PROVENANCE}" || { echo "provenance does not bind packaging commit" >&2; exit 1; }
jq -e --arg build_id "${BUILD_ID}" '.. | strings | select(. == $build_id)' >/dev/null <<<"${PROVENANCE}" || { echo "provenance does not bind build ID" >&2; exit 1; }
jq -e --arg base_image "${BASE_IMAGE}" '.. | strings | select(. == $base_image)' >/dev/null <<<"${PROVENANCE}" || { echo "provenance does not bind base image" >&2; exit 1; }

cosign verify --bundle "${COSIGN_BUNDLE}" --certificate-identity "${COSIGN_CERTIFICATE_IDENTITY}" --certificate-oidc-issuer https://token.actions.githubusercontent.com "${IMAGE}" >/dev/null
if command -v trivy >/dev/null; then
  TRIVY_BIN=trivy
else
  TRIVY_BIN="${TRIVY_IMAGE:-aquasec/trivy:latest}"
  docker pull "${TRIVY_BIN}" >/dev/null
fi
if [[ "${TRIVY_BIN}" == *:* ]]; then
  docker run --rm "${TRIVY_BIN}" image --platform linux/amd64 --scanners vuln --severity CRITICAL,HIGH --exit-code 1 --no-progress "${IMAGE}"
  TRIVY_VERSION="$(docker run --rm "${TRIVY_BIN}" --version | awk 'NR == 1 {print $2}')"
else
  "${TRIVY_BIN}" image --platform linux/amd64 --scanners vuln --severity CRITICAL,HIGH --exit-code 1 --no-progress "${IMAGE}"
  TRIVY_VERSION="$("${TRIVY_BIN}" --version | awk 'NR == 1 {print $2}')"
fi

PACKAGE_VERSION="$(sed -n 's/^version = "\([^"]*\)"$/\1/p' "${REPO_ROOT}/infra/lore/lore/Cargo.toml" | head -n 1)"
VERSION_OUTPUT="$(docker run --rm --platform linux/amd64 -e LORE__SERVER=invalid "${IMAGE}" 2>&1 || true)"
grep -Fq "Server version: ${PACKAGE_VERSION}+${LORE_VERSION}" <<<"${VERSION_OUTPUT}" || { printf '%s\n' "${VERSION_OUTPUT}" >&2; exit 1; }

BUNDLE_SHA256="sha256:$(shasum -a 256 "${COSIGN_BUNDLE}" | awk '{print $1}')"
node "${SCRIPT_DIR}/record-verified-dockerhub-lore.mjs" "${IMAGE}" "${BASE_IMAGE}" "${PLATFORM_DIGEST}" "${SOURCE_COMMIT}" "${PACKAGING_COMMIT}" "${BUILD_ID}" "${TRIVY_VERSION}" "${COSIGN_CERTIFICATE_IDENTITY}" https://token.actions.githubusercontent.com "${BUNDLE_SHA256}"
